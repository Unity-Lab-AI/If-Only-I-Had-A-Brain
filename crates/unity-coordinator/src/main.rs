//! `unity-coordinator` — the Rust control surface, phase **B5**.
//!
//! ⛔⛔ **THIS DOES NOT REPLACE `brain-server.js` AND MUST NOT BE POINTED AT THE
//! LIVE BOX YET.** It serves the routing, the privilege gate and static files —
//! it does **not** hold the weights, run the curriculum, or speak the donor
//! protocol. §5.3 is explicit that `unity-coordinator` stays **one binary** and
//! that the weights live in this process's address space; that part is not
//! built.
//!
//! ⭐ What it IS: the thing that makes the cutover *possible*. Until something
//! else can answer the endpoints, `brain-server.js` cannot be deleted and the
//! language counter cannot move. This is that something, starting with the two
//! pieces that are already proven against the shipped implementation — the
//! privilege gate (180/180 parity) and the route table.
//!
//! Run it and point a browser at it; it serves the real `html/` tree and
//! enforces the real gate.

mod http;
mod static_files;
mod upstream;

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use unity_http::{authorize_request, Access, Denied, RequestDenied};

fn env_flag(k: &str) -> bool { std::env::var(k).map(|v| v == "1").unwrap_or(false) }

fn arg(name: &str) -> Option<String> {
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        if let Some(v) = a.strip_prefix(&format!("--{name}=")) { return Some(v.into()); }
        if a == format!("--{name}") { return it.next(); }
    }
    None
}

struct Ctx {
    proxy_auth: bool,
    statics: Option<static_files::StaticRoot>,
    started: std::time::Instant,
    /// Where the Node brain listens. `None` = no upstream configured, and every
    /// cognition endpoint then answers **501 naming that fact** rather than a
    /// plausible empty shape.
    upstream: Option<upstream::Upstream>,
}

fn main() {
    let bind = arg("bind").unwrap_or_else(|| "127.0.0.1:7526".into());
    let root = arg("root").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let proxy_auth = env_flag("UAL_PROXY_AUTH");

    let statics = match static_files::StaticRoot::new(&root) {
        Ok(s) => Some(s),
        Err(e) => {
            eprintln!("[coordinator] WARN — static root {} unusable ({e}); serving endpoints only", root.display());
            None
        }
    };

    let listener = match TcpListener::bind(&bind) {
        Ok(l) => l,
        Err(e) => { eprintln!("[coordinator] FATAL — cannot bind {bind}: {e}"); std::process::exit(1); }
    };

    println!("[coordinator] listening on {bind}");
    println!("[coordinator] static root: {}", root.display());
    // ⚠ Stated at boot because it is the difference between "loopback is enough"
    // and "loopback is universal, so an identity is required" — and getting that
    // wrong is invisible until it is a breach.
    println!("[coordinator] proxy-auth: {} — {}", proxy_auth,
        if proxy_auth { "privileged endpoints ALSO require a proxy-vouched X-UAL-User" }
        else { "privileged endpoints are loopback-only (local dev)" });

    // ⭐ THE CUTOVER LEVER. With `--upstream=<port>` this process becomes the
    // FRONT DOOR: it owns the socket, the routing table, the privilege gate and
    // the static files, and forwards anything that needs cognition to the Node
    // brain. Without it, nothing changes and the endpoints still say 501 — so
    // the flag is also the rollback.
    let upstream = arg("upstream")
        .and_then(|v| v.parse::<u16>().ok())
        .map(upstream::Upstream::loopback);
    match &upstream {
        Some(u) => println!(
            "[coordinator] upstream: {}:{} — cognition endpoints are FORWARDED to the Node brain; this process is the front door",
            u.host, u.port
        ),
        None => println!(
            "[coordinator] upstream: none (--upstream=<port> to enable) — cognition endpoints answer 501 by design"
        ),
    }
    if upstream.is_some() && !proxy_auth {
        // ⚠ Said out loud because the combination is safe locally and wrong in
        // production: behind the proxy EVERY request the brain sees is loopback,
        // so if the brain is also running without proxy-auth its own gate is
        // satisfied by construction and this process is the only thing left
        // guarding /shutdown.
        println!("[coordinator] ⚠ upstream set with proxy-auth OFF — fine for local dev, and in production it means THIS process is the only gate the brain has. Set UAL_PROXY_AUTH=1 on both.");
    }

    let ctx = std::sync::Arc::new(Ctx {
        proxy_auth,
        statics,
        started: std::time::Instant::now(),
        upstream,
    });

    for conn in listener.incoming() {
        match conn {
            Ok(s) => {
                let ctx = ctx.clone();
                // ⚠ Thread per connection, and every connection is closed after
                // one response (`Connection: close`), so a thread cannot be held
                // open by a client that simply stops talking.
                std::thread::spawn(move || handle(s, &ctx));
            }
            Err(e) => eprintln!("[coordinator] accept failed: {e}"),
        }
    }
}

fn handle(mut stream: TcpStream, ctx: &Ctx) {
    let peer = stream.peer_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    let req = match http::read_request(&stream) {
        Ok(r) => r,
        Err(http::ReadError::Closed) => return,
        Err(e) => {
            let _ = http::write_response(&mut stream,
                &http::Response::json(400, format!(r#"{{"error":"bad request: {e:?}"}}"#)));
            return;
        }
    };

    // ⭐ THE WEBSOCKET LANE FORKS BEFORE THE NORMAL RESPONSE PATH, because an
    // upgrade does not have one: after the 101 this connection stops being
    // request/response and becomes a tunnel, so it can never be handed to
    // `write_response`.
    //
    // ⛔ It still goes through the SAME gate first. A socket is not exempt from
    // the privilege model — `/ws` is public, and the identity that separates the
    // admin lane from the donor lane is decided here, once, by the same code
    // that decides it for every other route.
    if upstream::is_websocket_upgrade(&req) {
        if let Some(up) = &ctx.upstream {
            match authorize_request(&req.method, &req.target, &peer, ctx.proxy_auth, req.header("x-ual-user")) {
                Ok(r) => {
                    let vouched = vouched_identity(r, ctx.proxy_auth, req.header("x-ual-user"));
                    upstream::proxy_websocket(stream, &req, up, &peer, vouched);
                }
                Err(_) => {
                    let _ = http::write_response(&mut stream,
                        &http::Response::json(403, r#"{"error":"forbidden"}"#));
                }
            }
            return;
        }
        let _ = http::write_response(&mut stream, &http::Response::json(501,
            r#"{"error":"websocket upgrade needs an upstream","note":"start with --upstream=<port>"}"#));
        return;
    }

    let resp = route(&req, &peer, ctx);
    let _ = http::write_response(&mut stream, &resp);
}

/// The identity this process will vouch for to the brain — **and the only
/// source of `X-UAL-User` upstream.**
///
/// ⛔⛔ TWO CASES, AND BOTH ARE NARROW ON PURPOSE.
///
/// **① A privileged route with proxy-auth on.** `check()` actually examined the
/// header to let the caller through, so relaying it is relaying a decision this
/// process made.
///
/// **② `/ws`, which is PUBLIC and still needs it.** The shipped nginx sends the
/// public donor socket and the Forgejo-authenticated admin socket to the *same*
/// backend path, and the brain tells them apart by this header alone. Dropping
/// it — the default for a public route — would silently downgrade the admin
/// lane to a public one: it would connect, work, and quietly be the wrong lane.
///
/// ⚠ Case ② is honoured **only when `proxy_auth` is on**, because its safety
/// rests entirely on nginx stripping client-supplied copies. With the flag off
/// there is no nginx guarantee, so nothing is vouched and there is simply no
/// admin socket locally.
fn vouched_identity<'a>(
    route: &unity_http::Route,
    proxy_auth: bool,
    ual: Option<&'a str>,
) -> Option<&'a str> {
    if !proxy_auth {
        return None;
    }
    if route.access == Access::Privileged || route.forward_identity {
        ual
    } else {
        None
    }
}

fn route(req: &http::Request, peer: &str, ctx: &Ctx) -> http::Response {
    let ual = req.header("x-ual-user");

    // ⭐ `authorize_request` rather than `authorize`: it is impossible to call
    // this form and forget the method check, which is the whole point of it
    // existing. A GET /shutdown from loopback would otherwise pass the gate.
    match authorize_request(&req.method, &req.target, peer, ctx.proxy_auth, ual) {
        Ok(r) => {
            // ⚠ Known route, caller allowed. Only the endpoints that need no
            // brain state are answered; everything else says so plainly rather
            // than returning a plausible empty shape.
            let path = req.target.split(['?', '#']).next().unwrap_or(&req.target);
            match path {
                "/health" => http::Response::json(200, format!(
                    r#"{{"ok":true,"service":"unity-coordinator","uptimeSec":{},"proxyAuth":{}}}"#,
                    ctx.started.elapsed().as_secs(), ctx.proxy_auth)).no_store(),
                // ⭐ EVERYTHING ELSE NEEDS THE BRAIN, so it goes to the brain.
                //
                // ⛔⛔ THE IDENTITY WE FORWARD IS THE ONE **WE** VALIDATED, AND
                // ONLY FOR A ROUTE WHOSE GATE ACTUALLY CHECKED IT. `check()`
                // validates `x-ual-user` only on a Privileged route with
                // proxy-auth on; on a Public route it is never examined, so
                // vouching for it there would be laundering an unvalidated
                // client header into a trusted one. That is the whole
                // header-smuggling hazard, and the narrowness of this condition
                // is the fix — see `upstream::hop_by_hop`, which drops the
                // inbound copy unconditionally.
                _ => match &ctx.upstream {
                    Some(up) => {
                        let vouched = vouched_identity(r, ctx.proxy_auth, ual);
                        upstream::forward(req, up, peer, vouched)
                    }
                    None if r.access == Access::Privileged => http::Response::json(501, format!(
                        r#"{{"error":"not implemented in unity-coordinator yet","path":"{path}","note":"the privilege gate ALLOWED this caller; the action itself still lives in brain-server.js. Start with --upstream=<port> to forward it there."}}"#)),
                    None => http::Response::json(501, format!(
                        r#"{{"error":"not implemented in unity-coordinator yet","path":"{path}","note":"start with --upstream=<port> to forward this to the Node brain"}}"#)),
                },
            }
        }
        Err(RequestDenied::MethodNotAllowed { allowed }) => {
            // ⚠ 405, not 403. The caller may well be authorized; the METHOD is
            // what was wrong, and calling it "forbidden" would send them hunting
            // a permissions problem that does not exist.
            let path = req.target.split('?').next().unwrap_or("");
            eprintln!("[coordinator] Rejected {} {path} — mutating endpoints are {allowed}-only (a GET can be forged by an <img> tag from loopback)", req.method);
            let mut r = http::Response::json(405, format!(
                r#"{{"error":"method not allowed","allowed":"{allowed}","note":"mutating endpoints require POST so a cross-origin GET cannot fire them"}}"#));
            r.extra.push(("Allow".into(), allowed.to_string()));
            r
        }
        Err(RequestDenied::Forbidden(d)) => {
            // ⭐ The refusal is logged with its reason, so a 403 is diagnosable
            // from the console rather than only from the caller's side.
            eprintln!("[coordinator] {}", d.log(req.target.split('?').next().unwrap_or("")));
            let mut r = http::Response::json(d.status(), d.body());
            if matches!(d, Denied::NoProxyIdentity) {
                r.extra.push(("X-Refusal".into(), "no-proxy-identity".into()));
            }
            r
        }
        Err(RequestDenied::NotFound) => {
            // ⛔ Unknown route. Try static ONLY here — a path that matched a
            // privileged route must never be reachable as a file.
            if let Some(s) = &ctx.statics {
                if let static_files::Served::File { bytes, content_type } = s.serve(&req.target) {
                    return http::Response::bytes(200, content_type, bytes);
                }
            }
            http::Response::json(404, r#"{"error":"not found"}"#)
        }
    }
}
