//! # unity-http — the control surface's routing and privilege model
//!
//! Migration phase **B5**. §5.2: this crate owns *"routing, auth,
//! request/response shapes"* and must **not** own *"direct weight or donor
//! mutation (call the crates)"*.
//!
//! ## ⛔⛔ THIS IS THE HIGHEST-STAKES CODE IN THE MIGRATION
//!
//! A routing bug here does not corrupt a matrix — it exposes `/shutdown`,
//! `/reset` and `/grade-advance` to the internet. So the privilege decision is
//! a **pure function over (path, remote address, proxy-auth mode, headers)**,
//! with nothing between it and its tests, and it is ported from the shipped
//! `requireLoopback` line by line rather than reimagined.
//!
//! ## The two-layer model, which is easy to get half-right
//!
//! **Local dev:** brain-mutating HTTP stays loopback-only.
//!
//! **Deployed (`UAL_PROXY_AUTH=1`):** ⛔ **every caller is loopback, because
//! they all arrive through the Forgejo-auth reverse proxy — so loopback ALONE
//! IS NOT AUTHORIZATION.** The endpoint additionally requires a proxy-vouched
//! identity in `X-UAL-User`, which the proxy sets only after auth and strips
//! from client-supplied copies.
//!
//! ⚠ **Implementing only the first layer would look correct in local testing
//! and be wide open in production** — every request would pass the loopback
//! check. That is the specific failure this module's tests exist to prevent.

/// What a caller is allowed to do with an endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Access {
    /// Anyone. The public snapshot, health, the download links.
    Public,
    /// Loopback, plus a proxy-vouched identity when proxy-auth is on.
    Privileged,
}

/// Why a request was refused. ⚠ Two distinct 403s with two distinct messages,
/// because *"you are not local"* and *"you are not authenticated"* send an
/// operator to two different places.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Denied {
    NotLoopback { addr: String },
    NoProxyIdentity,
}

impl Denied {
    /// The body the JS emits, byte for byte.
    pub fn body(&self) -> &'static str {
        match self {
            Denied::NotLoopback { .. } =>
                r#"{"error":"forbidden — privileged endpoint requires loopback caller"}"#,
            Denied::NoProxyIdentity =>
                r#"{"error":"forbidden — admin endpoint requires Forgejo auth"}"#,
        }
    }
    pub fn status(&self) -> u16 { 403 }
    /// The warn line, so a refusal is diagnosable from the console ring.
    pub fn log(&self, endpoint: &str) -> String {
        match self {
            Denied::NotLoopback { addr } => format!("Rejected non-loopback {endpoint} from {addr}"),
            Denied::NoProxyIdentity => format!("Rejected unauthenticated {endpoint} (proxy-auth on, no X-UAL-User)"),
        }
    }
}

/// Is this remote address loopback?
///
/// ⚠ Ported EXACTLY, including the `127.` prefix arm. The whole `127.0.0.0/8`
/// block is loopback, not just `127.0.0.1`, and narrowing it would refuse
/// legitimate local callers.
///
/// ⛔ **`::ffff:127.0.0.1` is listed explicitly** — an IPv4-mapped IPv6 address.
/// A Rust port that parsed with `IpAddr::is_loopback()` would get this *right*
/// for `::1` and **WRONG** for the mapped form, because `Ipv6Addr::is_loopback`
/// is false for `::ffff:127.0.0.1`. A dual-stack listener produces exactly that
/// form, so the "cleaner" implementation would lock the operator out of their
/// own box.
pub fn is_loopback(addr: &str) -> bool {
    addr == "127.0.0.1"
        || addr == "::1"
        || addr == "::ffff:127.0.0.1"
        || addr.starts_with("127.")
}

/// The privilege gate. Ported from `requireLoopback`.
///
/// `proxy_auth` is `UAL_PROXY_AUTH == "1"`; `ual_user` is the `X-UAL-User`
/// header **already trimmed**, exactly as the JS does before testing it.
pub fn check(access: &Access, addr: &str, proxy_auth: bool, ual_user: Option<&str>) -> Result<(), Denied> {
    if *access == Access::Public { return Ok(()); }
    if !is_loopback(addr) {
        return Err(Denied::NotLoopback { addr: addr.to_string() });
    }
    if proxy_auth {
        // ⚠ `.trim()` then emptiness — a header of "   " is NOT an identity.
        let ok = ual_user.map(str::trim).is_some_and(|u| !u.is_empty());
        if !ok { return Err(Denied::NoProxyIdentity); }
    }
    Ok(())
}

/// One route.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub path: &'static str,
    pub access: Access,
    /// True when the path is a prefix (e.g. `/rollback/<slot>`).
    pub prefix: bool,
    /// ⛔⛔ **A MUTATING ENDPOINT MUST NOT BE REACHABLE BY GET.** A `GET
    /// /shutdown` is a drive-by: an `<img src="http://127.0.0.1:7525/shutdown">`
    /// on any page the operator visits is enough to fire it, and the browser
    /// sends it happily from loopback with no script involved.
    ///
    /// ⭐ The privilege gate cannot catch that — the request genuinely IS from
    /// loopback. **Requiring POST is what makes the gate meaningful**, because a
    /// cross-origin POST cannot be issued without CORS the server never grants.
    pub post_only: bool,
}

const fn pub_(path: &'static str) -> Route { Route { path, access: Access::Public, prefix: false, post_only: false } }
const fn priv_(path: &'static str) -> Route { Route { path, access: Access::Privileged, prefix: false, post_only: true } }
const fn priv_prefix(path: &'static str) -> Route { Route { path, access: Access::Privileged, prefix: true, post_only: true } }
/// Privileged but readable — a GET is legitimate (it changes nothing).
const fn priv_read(path: &'static str) -> Route { Route { path, access: Access::Privileged, prefix: false, post_only: false } }

/// The control surface, transcribed from `brain-server.js`.
///
/// ⛔ **EVERY ENDPOINT THE SHIPPED SERVER GATES WITH `requireLoopback` IS
/// `Privileged` HERE.** That list was read out of the source, not recalled:
/// `/auto-advance` `/autoscale` `/checkpoint` `/corpus-buffer` `/derived-memory`
/// `/grade-advance` `/grade-signoff` `/knob` `/knob-default` `/learn-from-web`
/// `/pollinations-key` `/reset` `/restart` `/resync` `/rollback` `/savererun`
/// `/shutdown` `/teach-bench` `/update`.
///
/// ⚠ Anything NOT in that list is public **in the shipped server**, and this
/// table reproduces that rather than tightening it. Tightening silently would
/// break the public dashboard, and loosening silently would expose the brain —
/// **a port's job is to be identical, then change deliberately.**
pub const ROUTES: &[Route] = &[
    // ── privileged: brain-mutating ────────────────────────────────────────
    priv_("/shutdown"), priv_("/restart"), priv_("/reset"), priv_("/savererun"),
    priv_("/update"), priv_("/checkpoint"), priv_("/rollback"), priv_prefix("/rollback/"),
    priv_("/grade-advance"), priv_("/grade-signoff"), priv_("/auto-advance"),
    priv_("/autoscale"), priv_("/resync"), priv_("/learn-from-web"),
    priv_("/knob"), priv_("/knob-default"), priv_("/corpus-buffer"),
    // ⚠ These three are privileged but READ-shaped — the shipped server answers
    // them to a GET, and forcing POST would break the dashboard's own polling.
    // Privilege and mutation are different questions.
    priv_read("/derived-memory"), priv_read("/teach-bench"), priv_read("/pollinations-key"),
    // ── public: observation + assets ──────────────────────────────────────
    pub_("/health"), pub_("/public-state.json"), pub_("/console-tail.json"),
    pub_("/donor-latest.json"), pub_("/minds-eye.json"), pub_("/teach-ledger.json"),
    pub_("/episodes"), pub_("/history"), pub_("/milestone"), pub_("/versions"),
    pub_("/exam-answer"), pub_("/sleep"), pub_("/wake"), pub_("/diag/parity"),
    pub_("/weights/list"), pub_("/weights/download"),
    pub_("/download/donor-linux"), pub_("/download/donor-windows"),
    pub_("/brain-equations.html"), pub_("/unity-guide.html"),
];

/// Resolve a request path to a route.
///
/// ⚠ The query string is stripped first. `/*shutdown?x=1*/` must resolve to
/// `/shutdown` — a router that matched the raw URL would treat it as unknown
/// and, depending on the fallback, might serve it as a static file.
pub fn resolve(url: &str) -> Option<&'static Route> {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    // Exact first, then prefixes — an exact `/rollback` must not be shadowed.
    ROUTES.iter().find(|r| !r.prefix && r.path == path)
        .or_else(|| ROUTES.iter().find(|r| r.prefix && path.starts_with(r.path)))
}

/// Full decision for one request. ⭐ `None` route = unknown, which is a 404 and
/// **never a pass** — an unmatched privileged-looking path must not fall through
/// to a permissive default.
pub fn authorize(url: &str, addr: &str, proxy_auth: bool, ual_user: Option<&str>)
    -> Result<&'static Route, Option<Denied>>
{
    let Some(route) = resolve(url) else { return Err(None) };
    match check(&route.access, addr, proxy_auth, ual_user) {
        Ok(()) => Ok(route),
        Err(d) => Err(Some(d)),
    }
}

/// Is this method allowed for this route?
///
/// ⛔ Checked SEPARATELY from privilege, because they refuse different things:
/// the gate answers *"are you allowed to ask?"* and this answers *"is this a way
/// of asking that could have been forged?"*
pub fn method_allowed(route: &Route, method: &str) -> bool {
    if !route.post_only { return true; }
    method.eq_ignore_ascii_case("POST")
}

/// The whole decision, including the method. ⭐ The form a server should call —
/// it is impossible to use this and forget the method check.
pub fn authorize_request(method: &str, url: &str, addr: &str, proxy_auth: bool, ual_user: Option<&str>)
    -> Result<&'static Route, RequestDenied>
{
    let route = match authorize(url, addr, proxy_auth, ual_user) {
        Ok(r) => r,
        Err(Some(d)) => return Err(RequestDenied::Forbidden(d)),
        Err(None) => return Err(RequestDenied::NotFound),
    };
    if !method_allowed(route, method) {
        return Err(RequestDenied::MethodNotAllowed { allowed: "POST" });
    }
    Ok(route)
}

#[derive(Debug, PartialEq, Eq)]
pub enum RequestDenied {
    NotFound,
    Forbidden(Denied),
    /// ⚠ 405, not 403 — the caller may well be authorized; the METHOD is wrong,
    /// and saying "forbidden" would send them looking for a permissions problem.
    MethodNotAllowed { allowed: &'static str },
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── the loopback predicate ───────────────────────────────────────────────
    #[test]
    fn every_form_the_shipped_check_accepts() {
        for a in ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.0.5", "127.255.255.254"] {
            assert!(is_loopback(a), "{a} must be loopback — the JS accepts it");
        }
    }

    #[test]
    fn the_ipv4_mapped_form_is_why_a_cleaner_implementation_would_be_wrong() {
        // ⛔ `Ipv6Addr::is_loopback()` is FALSE for ::ffff:127.0.0.1, and a
        // dual-stack listener produces exactly that form. A port that "tidied"
        // this into IpAddr parsing would lock the operator out of their own box.
        assert!(is_loopback("::ffff:127.0.0.1"));
        let parsed: std::net::IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        assert!(!parsed.is_loopback(),
            "this is exactly the trap: the stdlib says NOT loopback for the mapped form");
    }

    #[test]
    fn public_addresses_are_never_loopback() {
        for a in ["", "0.0.0.0", "10.0.0.1", "192.168.1.5", "1.2.3.4",
                  "::ffff:10.0.0.1", "2001:db8::1", "128.0.0.1", "1270.0.0.1"] {
            assert!(!is_loopback(a), "{a} must NOT be loopback");
        }
    }

    #[test]
    fn a_lookalike_prefix_does_not_pass() {
        // `127.` is a prefix match in the JS; these still must not match it.
        assert!(!is_loopback("12.7.0.1"));
        assert!(!is_loopback("227.0.0.1"));
    }

    // ── the two-layer gate ───────────────────────────────────────────────────
    #[test]
    fn local_dev_privileged_needs_loopback_only() {
        assert!(check(&Access::Privileged, "127.0.0.1", false, None).is_ok());
        assert_eq!(check(&Access::Privileged, "10.0.0.1", false, None),
                   Err(Denied::NotLoopback { addr: "10.0.0.1".into() }));
    }

    #[test]
    fn deployed_loopback_alone_is_not_authorization() {
        // ⛔⛔ THE FAILURE THIS MODULE EXISTS TO PREVENT. Behind the reverse
        // proxy EVERY caller is loopback, so a port implementing only the first
        // layer looks perfect locally and is wide open in production.
        assert_eq!(check(&Access::Privileged, "127.0.0.1", true, None),
                   Err(Denied::NoProxyIdentity),
                   "proxy-auth on + no identity MUST be refused even from loopback");
        assert!(check(&Access::Privileged, "127.0.0.1", true, Some("GFourteen")).is_ok());
    }

    #[test]
    fn a_whitespace_identity_is_not_an_identity() {
        for u in ["", "   ", "\t", "\n"] {
            assert_eq!(check(&Access::Privileged, "127.0.0.1", true, Some(u)),
                       Err(Denied::NoProxyIdentity), "{u:?} must not authorize");
        }
    }

    #[test]
    fn the_not_loopback_check_runs_BEFORE_the_identity_check() {
        // A remote caller with a forged header must be refused for being
        // remote — reporting "no identity" would imply that supplying one is
        // enough, which off-loopback it is not.
        assert_eq!(check(&Access::Privileged, "8.8.8.8", true, Some("attacker")),
                   Err(Denied::NotLoopback { addr: "8.8.8.8".into() }));
    }

    #[test]
    fn public_endpoints_ignore_both_layers() {
        assert!(check(&Access::Public, "8.8.8.8", true, None).is_ok(),
            "the public snapshot is public — that is the point of it");
    }

    #[test]
    fn the_two_refusals_carry_different_messages() {
        let a = Denied::NotLoopback { addr: "1.2.3.4".into() };
        let b = Denied::NoProxyIdentity;
        assert!(a.body().contains("loopback caller"));
        assert!(b.body().contains("Forgejo auth"));
        assert_ne!(a.body(), b.body(),
            "'you are not local' and 'you are not authenticated' send an operator to different places");
        assert_eq!(a.status(), 403);
        assert_eq!(b.status(), 403);
    }

    // ── the route table ──────────────────────────────────────────────────────
    #[test]
    fn every_endpoint_the_shipped_server_gates_is_privileged_here() {
        // Read out of brain-server.js's requireLoopback call sites.
        for p in ["/auto-advance", "/autoscale", "/checkpoint", "/corpus-buffer",
                  "/derived-memory", "/grade-advance", "/grade-signoff", "/knob",
                  "/knob-default", "/learn-from-web", "/pollinations-key", "/reset",
                  "/restart", "/resync", "/rollback", "/savererun", "/shutdown",
                  "/teach-bench", "/update"] {
            let r = resolve(p).unwrap_or_else(|| panic!("{p} is missing from the route table"));
            assert_eq!(r.access, Access::Privileged, "{p} MUST be privileged");
        }
    }

    #[test]
    fn the_destructive_verbs_refuse_an_unauthenticated_deployed_caller() {
        for p in ["/shutdown", "/reset", "/update", "/restart", "/savererun"] {
            assert_eq!(authorize(p, "127.0.0.1", true, None), Err(Some(Denied::NoProxyIdentity)),
                "{p} must not be reachable without a vouched identity");
        }
    }

    #[test]
    fn the_query_string_is_stripped_before_matching() {
        // ⚠ `/update?keep=1` is a REAL call the dashboard makes.
        let r = resolve("/update?keep=1").expect("must resolve with a query");
        assert_eq!(r.access, Access::Privileged, "a query string must not turn a privileged route unknown");
        assert!(resolve("/shutdown?x=1").is_some());
        assert!(resolve("/public-state.json?console=200").is_some());
    }

    #[test]
    fn a_prefix_route_matches_its_children_without_shadowing_the_exact_one() {
        assert!(resolve("/rollback").is_some());
        let child = resolve("/rollback/v2").expect("a slot path must resolve");
        assert_eq!(child.access, Access::Privileged);
    }

    #[test]
    fn an_unknown_path_is_a_404_and_never_a_pass() {
        assert_eq!(authorize("/nope", "127.0.0.1", false, None), Err(None));
        assert_eq!(authorize("/shutdownX", "127.0.0.1", false, None), Err(None),
            "a near-miss on a privileged name must not fall through to anything permissive");
        assert_eq!(authorize("/../etc/passwd", "127.0.0.1", false, None), Err(None));
    }

    #[test]
    fn the_public_reads_stay_public_so_the_dashboard_keeps_working() {
        for p in ["/public-state.json", "/health", "/console-tail.json", "/donor-latest.json"] {
            assert!(authorize(p, "203.0.113.7", true, None).is_ok(),
                "{p} is what a public viewer polls — tightening it silently would break the dashboard");
        }
    }

    // ── the method gate ──────────────────────────────────────────────────────
    #[test]
    fn a_get_cannot_fire_a_destructive_verb() {
        // ⛔⛔ THE DRIVE-BY. `<img src="http://127.0.0.1:7525/shutdown">` on any
        // page the operator visits sends a GET from loopback with no script
        // involved — and the privilege gate CANNOT catch it, because the request
        // genuinely is from loopback.
        for p in ["/shutdown", "/reset", "/update", "/restart", "/savererun",
                  "/grade-advance", "/checkpoint", "/rollback"] {
            assert_eq!(authorize_request("GET", p, "127.0.0.1", false, None),
                       Err(RequestDenied::MethodNotAllowed { allowed: "POST" }),
                       "GET {p} must be refused — an <img> tag is enough to send one");
            assert!(authorize_request("POST", p, "127.0.0.1", false, None).is_ok(),
                       "but POST {p} from loopback is the real control path");
        }
    }

    #[test]
    fn method_refusal_is_405_not_403_because_they_send_you_different_places() {
        let e = authorize_request("GET", "/shutdown", "127.0.0.1", false, None).unwrap_err();
        assert!(matches!(e, RequestDenied::MethodNotAllowed { .. }),
            "the caller may well be authorized; reporting 'forbidden' would send them hunting a permissions problem");
    }

    #[test]
    fn privilege_is_still_checked_before_the_method() {
        // A remote GET must be refused for being remote — otherwise a 405 tells
        // an unauthorized caller that POST would have worked.
        assert!(matches!(authorize_request("GET", "/shutdown", "8.8.8.8", false, None),
                         Err(RequestDenied::Forbidden(_))));
    }

    #[test]
    fn read_shaped_privileged_endpoints_still_accept_get() {
        // ⚠ Privilege and mutation are different questions. Forcing POST on
        // these would break the dashboard's own polling.
        for p in ["/derived-memory", "/teach-bench", "/pollinations-key"] {
            assert!(authorize_request("GET", p, "127.0.0.1", false, None).is_ok(),
                "{p} is privileged but read-shaped — the shipped server answers a GET");
        }
    }

    #[test]
    fn public_reads_accept_get_as_they_must() {
        for p in ["/health", "/public-state.json", "/console-tail.json"] {
            assert!(authorize_request("GET", p, "203.0.113.7", true, None).is_ok());
        }
    }

    #[test]
    fn an_unknown_path_is_not_found_regardless_of_method() {
        assert_eq!(authorize_request("POST", "/nope", "127.0.0.1", false, None), Err(RequestDenied::NotFound));
        assert_eq!(authorize_request("GET", "/nope", "127.0.0.1", false, None), Err(RequestDenied::NotFound));
    }

    #[test]
    fn every_mutating_route_is_post_only_and_no_public_route_is() {
        for r in ROUTES {
            if r.post_only {
                assert_eq!(r.access, Access::Privileged,
                    "{} is post-only but public — that combination has no meaning here", r.path);
            }
        }
        // Spot-check the destructive set is actually flagged.
        for p in ["/shutdown", "/reset", "/update"] {
            assert!(resolve(p).unwrap().post_only, "{p} must be POST-only");
        }
    }

    #[test]
    fn no_route_is_listed_twice() {
        let mut seen = std::collections::BTreeSet::new();
        for r in ROUTES {
            assert!(seen.insert((r.path, r.prefix)), "duplicate route {}", r.path);
        }
    }
}
