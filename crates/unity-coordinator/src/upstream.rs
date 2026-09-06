//! Reverse proxy to the Node brain — migration phase **B5**, the cutover half.
//!
//! ## Why a proxy and not native endpoints
//!
//! §5's plan reads *"34 endpoints, the `UAL_PROXY_AUTH` / `X-UAL-User` model,
//! then retire the JS coordinator."* The first and third clauses are separated
//! by the entire brain: **every one of those endpoints reads cognition state** —
//! the cluster, the curriculum, the weights, episodic memory — and that state is
//! ~34,000 lines of `server/` plus `js/brain/`. Porting the endpoints *is* the
//! rewrite; it is not a step toward it.
//!
//! ⭐ **So the front door moves first and the cognition follows.** This process
//! takes the socket, the routing table, the privilege gate and the static files.
//! Anything that needs the brain is forwarded to the Node process on a loopback
//! port. That deletes the JS HTTP layer *today*, puts the security-critical gate
//! in Rust *in production* rather than in a test, and lets each endpoint later
//! move from proxied to native **without the front door changing at all**.
//!
//! ⚠ It costs one loopback hop. Measured against what it buys — the gate that
//! guards `/shutdown` running in the audited implementation instead of the one
//! that shipped `GET /shutdown` as a drive-by — that is not a close call.
//!
//! ## ⛔⛔ HEADER HYGIENE — AND AN HONEST ACCOUNT OF WHAT IT DOES NOT BUY
//!
//! Deployed, the trust chain is `nginx → coordinator → node`, and the identity
//! that authorizes a privileged call travels as `X-UAL-User`. **Behind this
//! proxy every request Node sees arrives from 127.0.0.1**, so Node's loopback
//! check is satisfied by construction and the header is the only thing left
//! deciding.
//!
//! ⭐ **The inbound header is DROPPED unconditionally and re-added only from the
//! value this process itself carried through the gate.** Not sanitised —
//! dropped, because a filter can be fooled by a duplicate or an odd casing and a
//! deletion cannot.
//!
//! ⚠ **BUT BE PRECISE ABOUT WHAT THAT PREVENTS, BECAUSE OVERCLAIMING HERE IS
//! ITS OWN HAZARD.** `unity_http::check` accepts *any non-empty* identity from
//! loopback; it does not consult a roster. That is not a gap in the port — it is
//! the shipped model, reproduced exactly (180/180), and the security rests on
//! **nginx setting that header**, not on this process recognising a name. A
//! forged `X-UAL-User: attacker` arriving *directly* at this port on a
//! privileged route is therefore forwarded, and would have been accepted by the
//! JS server too.
//!
//! So the drop buys exactly three things, and they are worth having:
//! 1. **A public route never launders a client header into a vouched one** —
//!    `vouched` is `None` unless the gate actually examined it, so
//!    `/public-state.json` reaches Node with no identity at all. Verified live.
//! 2. **Exactly one `X-UAL-User` reaches Node**, whatever the caller sent —
//!    no duplicate, no odd-cased second copy for a downstream parser to prefer.
//! 3. **With proxy-auth OFF nothing is vouched at all**, so Node can never be
//!    told an identity was validated when no validation ran.
//!
//! ⛔⛔ **THE REAL NEW RISK THIS HOP INTRODUCES, WRITTEN DOWN RATHER THAN
//! PAPERED OVER: there are now TWO doors to the brain.** Today nginx talks to
//! Node directly. After the cutover nginx talks to *this*, and Node is still
//! listening. **Node must bind loopback-only and nginx must point at the
//! coordinator alone** — otherwise the old door is still open and this gate is
//! decoration. That is a deployment precondition, not something this file can
//! enforce, and it belongs in the press notes beside the bind address.
//!
//! ⚠ Same trap, third appearance: *"deployed, loopback ALONE is not
//! authorization."* The hop we are introducing is what makes Node's own loopback
//! check meaningless, so the identity has to be carried deliberately.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::http;

/// Where the Node brain listens. Loopback only — this is an internal hop and
/// binding it anywhere else would publish the unguarded server.
#[derive(Debug, Clone)]
pub struct Upstream {
    pub host: String,
    pub port: u16,
    pub connect_timeout: Duration,
    pub read_timeout: Duration,
}

impl Upstream {
    pub fn loopback(port: u16) -> Self {
        Upstream {
            host: "127.0.0.1".into(),
            port,
            connect_timeout: Duration::from_secs(5),
            // ⚠ Generous: a cognition endpoint can legitimately take seconds
            // (the dashboard snapshot builds a 200 KB payload). Too tight here
            // turns a slow-but-working brain into a 502 nobody can explain.
            read_timeout: Duration::from_secs(120),
        }
    }
}

/// Headers that must not be copied across a hop.
///
/// ⛔ The first seven are the RFC 7230 §6.1 connection-scoped set — forwarding
/// them corrupts the framing of the next connection. **`x-ual-user` is the
/// eighth and it is here for a security reason, not a protocol one:** it is the
/// identity this process vouches for, so a client-supplied copy must never
/// reach the brain. See the module header.
///
/// ⚠ `content-length` is also dropped and recomputed, because the body we
/// forward is the body we parsed — a stale length is a request-smuggling
/// primitive.
fn hop_by_hop(name: &str) -> bool {
    matches!(
        name,
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "x-ual-user"
            | "content-length"
            | "host"
    )
}

/// Build the request line + headers this proxy will send upstream.
///
/// `vouched_user` is the identity **this process authorized**, or `None` when
/// the call was public. It is the only source of `X-UAL-User` upstream.
pub fn build_upstream_request(
    req: &http::Request,
    up: &Upstream,
    peer: &str,
    vouched_user: Option<&str>,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(512 + req.body.len());
    out.extend_from_slice(
        format!("{} {} HTTP/1.1\r\n", req.method, req.target).as_bytes(),
    );
    out.extend_from_slice(format!("Host: {}:{}\r\n", up.host, up.port).as_bytes());

    for (k, v) in &req.headers {
        if hop_by_hop(k) {
            continue;
        }
        out.extend_from_slice(format!("{k}: {v}\r\n").as_bytes());
    }

    // ⭐ Re-added from OUR value, never from theirs.
    if let Some(u) = vouched_user {
        out.extend_from_slice(format!("X-UAL-User: {u}\r\n").as_bytes());
    }
    // ⚠ Recorded so the brain's own logs still name the real caller rather than
    // seeing 127.0.0.1 for everyone. Appended, not replaced, per convention.
    out.extend_from_slice(format!("X-Forwarded-For: {peer}\r\n").as_bytes());
    out.extend_from_slice(format!("Content-Length: {}\r\n", req.body.len()).as_bytes());
    // One request per connection, matching this server's own posture.
    out.extend_from_slice(b"Connection: close\r\n\r\n");
    out.extend_from_slice(&req.body);
    out
}

/// Forward a request and return the upstream's response verbatim.
///
/// ⚠ Returns a **502 with the reason named** when the brain is unreachable
/// rather than a generic failure. "The brain is down" and "the proxy is broken"
/// are different problems and an operator should not have to guess which.
pub fn forward(
    req: &http::Request,
    up: &Upstream,
    peer: &str,
    vouched_user: Option<&str>,
) -> http::Response {
    let addr = format!("{}:{}", up.host, up.port);
    let sock = match addr.parse().ok().and_then(|a| {
        TcpStream::connect_timeout(&a, up.connect_timeout).ok()
    }) {
        Some(s) => s,
        None => {
            return http::Response::json(
                502,
                format!(
                    r#"{{"error":"brain unreachable","upstream":"{addr}","note":"the coordinator is up; the Node brain did not accept a connection. Check the unity-brain service, not this process."}}"#
                ),
            )
            .no_store()
        }
    };
    let _ = sock.set_read_timeout(Some(up.read_timeout));
    let _ = sock.set_write_timeout(Some(up.connect_timeout));

    let mut sock = sock;
    let wire = build_upstream_request(req, up, peer, vouched_user);
    if let Err(e) = sock.write_all(&wire) {
        return http::Response::json(
            502,
            format!(r#"{{"error":"brain write failed","detail":"{e}"}}"#),
        )
        .no_store();
    }
    let _ = sock.flush();

    let mut raw = Vec::new();
    if let Err(e) = sock.read_to_end(&mut raw) {
        // ⚠ A timeout mid-body is reported as a timeout, not as a short read
        // that could be mistaken for a valid truncated payload.
        return http::Response::json(
            502,
            format!(r#"{{"error":"brain read failed","detail":"{e}","note":"a read timeout here means the endpoint is slow or wedged, not that it is missing"}}"#),
        )
        .no_store();
    }

    parse_upstream_response(&raw).unwrap_or_else(|| {
        http::Response::json(
            502,
            r#"{"error":"brain returned an unparseable response"}"#.to_string(),
        )
        .no_store()
    })
}

/// Parse an upstream HTTP/1.1 response into our own shape.
///
/// ⚠ Deliberately tolerant of the status line and strict about the split: the
/// body begins after the first CRLFCRLF and everything before it is headers.
pub fn parse_upstream_response(raw: &[u8]) -> Option<http::Response> {
    let split = find_headers_end(raw)?;
    let head = std::str::from_utf8(&raw[..split.0]).ok()?;
    let body = raw[split.1..].to_vec();

    let mut lines = head.split("\r\n");
    let status_line = lines.next()?;
    let mut sp = status_line.split(' ');
    let _version = sp.next()?;
    let status: u16 = sp.next()?.parse().ok()?;

    let mut content_type = "application/octet-stream".to_string();
    let mut extra = Vec::new();
    let mut chunked = false;
    for l in lines {
        if l.is_empty() {
            continue;
        }
        let (k, v) = l.split_once(':')?;
        let key = k.trim().to_ascii_lowercase();
        let val = v.trim().to_string();
        if key == "content-type" {
            content_type = val;
        } else if key == "transfer-encoding" {
            // ⛔⛔ THE BUG THIS BRANCH EXISTS FOR, AND IT SHIPPED FOR ABOUT TEN
            // MINUTES BEFORE A LIVE TEST CAUGHT IT.
            //
            // Node answers `/public-state.json` with `Transfer-Encoding:
            // chunked`. Stripping that header is CORRECT — it is connection-
            // scoped and must not survive a hop — but stripping the header
            // without DECODING THE BODY hands the client raw chunk framing
            // (`3336a\r\n{"type":"state"…`) underneath a `Content-Length` that
            // says it is all payload.
            //
            // ⚠ It returns HTTP 200 with a plausible byte count, so every check
            // short of parsing the body calls it a success. The first live
            // request through this proxy looked perfect and was corrupt.
            chunked = val.to_ascii_lowercase().contains("chunked");
        } else if !hop_by_hop(&key) {
            // ⚠ Content-Length is re-derived by the writer from the real body,
            // so forwarding the upstream's would risk a mismatch.
            extra.push((k.trim().to_string(), val));
        }
    }

    let body = if chunked { decode_chunked(&body)? } else { body };

    let mut resp = http::Response::bytes(status, content_type, body);
    resp.extra.extend(extra);
    Some(resp)
}

/// Is this request asking to become a WebSocket?
///
/// ⚠ Both conditions, and both case-insensitively. `Connection` is a
/// comma-separated list (`keep-alive, Upgrade`) so it is searched, not compared;
/// a strict equality test here would refuse real browsers.
pub fn is_websocket_upgrade(req: &http::Request) -> bool {
    let up = req.header("upgrade").unwrap_or("").to_ascii_lowercase();
    let conn = req.header("connection").unwrap_or("").to_ascii_lowercase();
    up == "websocket" && conn.split(',').any(|t| t.trim() == "upgrade")
}

/// Build the upgrade request to send upstream.
///
/// ⛔⛔ **`Upgrade` AND `Connection` MUST SURVIVE THIS HOP, AND THEY ARE ON THE
/// HOP-BY-HOP DROP LIST FOR EVERY OTHER REQUEST.** That is not a contradiction:
/// they are connection-scoped, and on an upgrade the connection they scope is
/// exactly the one being established. Dropping them here makes the upstream
/// answer 200 with a normal body instead of 101, and the client then waits
/// forever for a handshake that already failed.
///
/// ⛔ The `Sec-WebSocket-*` headers pass through **untouched**. The upstream
/// derives `Sec-WebSocket-Accept` from the client's `Sec-WebSocket-Key` by
/// SHA-1; altering, regenerating or normalising the key would produce an accept
/// value the client rejects — and the failure surfaces in the browser as a
/// silent close, not as an error naming this proxy.
pub fn build_upgrade_request(
    req: &http::Request,
    up: &Upstream,
    peer: &str,
    vouched_user: Option<&str>,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(512);
    out.extend_from_slice(format!("GET {} HTTP/1.1\r\n", req.target).as_bytes());
    out.extend_from_slice(format!("Host: {}:{}\r\n", up.host, up.port).as_bytes());
    for (k, v) in &req.headers {
        // Same hygiene as the normal path — including the unconditional drop of
        // any client-supplied identity — except that the two upgrade-carrying
        // headers are re-added below from the client's own values.
        if hop_by_hop(k) {
            continue;
        }
        out.extend_from_slice(format!("{k}: {v}\r\n").as_bytes());
    }
    out.extend_from_slice(b"Upgrade: websocket\r\nConnection: Upgrade\r\n");
    if let Some(u) = vouched_user {
        out.extend_from_slice(format!("X-UAL-User: {u}\r\n").as_bytes());
    }
    out.extend_from_slice(format!("X-Forwarded-For: {peer}\r\n").as_bytes());
    out.extend_from_slice(b"\r\n");
    out
}

/// Proxy a WebSocket: perform the upgrade upstream, relay the 101 back, then
/// pump bytes both ways until either side closes.
///
/// ⭐ **After the 101 this is a byte relay, not a protocol implementation.** The
/// frames, the masking, the ping/pong, the 2 GB `maxPayload` the donor lane uses
/// — none of it is parsed here, and none of it should be. Anything this process
/// understood about the frame format would be a second implementation to keep in
/// sync with the one that matters.
///
/// ⛔ **NO READ TIMEOUT ON THE RELAY.** A WebSocket is legitimately idle for long
/// stretches — a donor between batches, a dashboard between snapshots — and a
/// timeout here would drop healthy connections in a way that looks exactly like
/// the brain going away. The connection ends when a peer closes it, and the
/// close is propagated to the other side with `shutdown()` so neither half is
/// left waiting on a socket that will never speak again.
pub fn proxy_websocket(
    mut client: TcpStream,
    req: &http::Request,
    up: &Upstream,
    peer: &str,
    vouched_user: Option<&str>,
) {
    let addr = format!("{}:{}", up.host, up.port);
    let mut server = match addr.parse().ok().and_then(|a| {
        TcpStream::connect_timeout(&a, up.connect_timeout).ok()
    }) {
        Some(s) => s,
        None => {
            let _ = http::write_response(
                &mut client,
                &http::Response::json(
                    502,
                    r#"{"error":"brain unreachable for websocket upgrade"}"#.to_string(),
                ),
            );
            return;
        }
    };

    if server.write_all(&build_upgrade_request(req, up, peer, vouched_user)).is_err() {
        return;
    }
    let _ = server.flush();

    // Read exactly the upstream's response head, byte at a time, so that not one
    // byte of the frames that follow it is consumed into a buffer we then drop.
    // ⚠ A BufReader here would swallow the first frames — they arrive
    // immediately after the 101 on a busy lane, and they would be gone.
    let head = match read_head_exact(&mut server) {
        Some(h) => h,
        None => return,
    };
    if client.write_all(&head).is_err() {
        return;
    }
    let _ = client.flush();

    // Not a 101 — the upstream refused the upgrade. Its answer has been relayed
    // verbatim; there is no tunnel to pump.
    if !head.starts_with(b"HTTP/1.1 101") {
        return;
    }

    // ⚠ Timeouts cleared explicitly: `read_request` set a 30 s read timeout on
    // the client socket for slowloris protection, and leaving it on would kill
    // every idle WebSocket after thirty seconds.
    let _ = client.set_read_timeout(None);
    let _ = client.set_write_timeout(None);
    let _ = server.set_read_timeout(None);
    let _ = server.set_write_timeout(None);

    let (mut c_read, mut c_write) = match (client.try_clone(), client) {
        (Ok(a), b) => (a, b),
        _ => return,
    };
    let (mut s_read, mut s_write) = match (server.try_clone(), server) {
        (Ok(a), b) => (a, b),
        _ => return,
    };

    // client → upstream on its own thread; upstream → client on this one.
    let up_pump = std::thread::spawn(move || {
        pump(&mut c_read, &mut s_write);
        let _ = s_write.shutdown(std::net::Shutdown::Both);
    });
    pump(&mut s_read, &mut c_write);
    let _ = c_write.shutdown(std::net::Shutdown::Both);
    let _ = up_pump.join();
}

/// Copy until EOF or error. 64 KiB buffer — large enough that the donor's bulk
/// frames are not chopped into hundreds of syscalls, small enough to be
/// irrelevant per connection.
fn pump(from: &mut TcpStream, to: &mut TcpStream) {
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        match from.read(&mut buf) {
            Ok(0) => return,
            Ok(n) => {
                if to.write_all(&buf[..n]).is_err() {
                    return;
                }
                let _ = to.flush();
            }
            Err(_) => return,
        }
    }
}

/// Read an HTTP response head (through the blank line) one byte at a time.
///
/// ⛔ Byte-at-a-time is deliberate. Any buffered reader would read AHEAD of the
/// blank line and swallow the first WebSocket frames, which on a busy lane
/// arrive in the same packet as the 101. Those bytes would be silently lost and
/// the symptom would be a socket that connects and then misses its opening
/// messages — the hardest possible thing to attribute back to here.
fn read_head_exact(s: &mut TcpStream) -> Option<Vec<u8>> {
    let mut head = Vec::with_capacity(512);
    let mut b = [0u8; 1];
    while head.len() < 64 * 1024 {
        match s.read(&mut b) {
            Ok(0) => return None,
            Ok(_) => {
                head.push(b[0]);
                if head.ends_with(b"\r\n\r\n") {
                    return Some(head);
                }
            }
            Err(_) => return None,
        }
    }
    None
}

/// Decode an RFC 7230 §4.1 chunked body into the bytes it represents.
///
/// `<hex-size>[;ext]CRLF <data> CRLF … 0 CRLF [trailers] CRLF`
///
/// ⛔ Returns `None` rather than a partial body on anything malformed. A
/// truncated decode would be indistinguishable from a short but valid payload —
/// and this carries the dashboard's state snapshot, where "valid but missing
/// half the fields" is the worst possible outcome.
///
/// ⚠ Chunk extensions (`1a;foo=bar`) are legal and ignored, which is why the
/// size is parsed up to the first `;` rather than from the whole line.
pub fn decode_chunked(body: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(body.len());
    let mut i = 0usize;
    loop {
        // Chunk-size line.
        let nl = find_crlf(body, i)?;
        let line = std::str::from_utf8(&body[i..nl]).ok()?;
        let size_tok = line.split(';').next()?.trim();
        let size = usize::from_str_radix(size_tok, 16).ok()?;
        i = nl + 2;
        if size == 0 {
            // Last chunk. Trailers (if any) are dropped deliberately — nothing
            // downstream reads them and forwarding them would need the header
            // hygiene rules applied a second time.
            return Some(out);
        }
        if i + size > body.len() {
            return None;
        }
        out.extend_from_slice(&body[i..i + size]);
        i += size;
        // Each chunk is followed by its own CRLF.
        if body.get(i) != Some(&b'\r') || body.get(i + 1) != Some(&b'\n') {
            return None;
        }
        i += 2;
    }
}

fn find_crlf(b: &[u8], from: usize) -> Option<usize> {
    if from >= b.len() {
        return None;
    }
    b[from..]
        .windows(2)
        .position(|w| w == b"\r\n")
        .map(|p| from + p)
}

/// Byte offsets of (end-of-headers, start-of-body).
fn find_headers_end(raw: &[u8]) -> Option<(usize, usize)> {
    raw.windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| (i, i + 4))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn req(method: &str, target: &str, headers: &[(&str, &str)]) -> http::Request {
        let mut h = BTreeMap::new();
        for (k, v) in headers {
            h.insert(k.to_ascii_lowercase(), v.to_string());
        }
        http::Request {
            method: method.into(),
            target: target.into(),
            headers: h,
            body: Vec::new(),
        }
    }

    /// ⛔⛔ THE CORE PROPERTY. When this process did NOT vouch for an identity —
    /// a public route, or proxy-auth off — the caller's own header must not
    /// reach the brain wearing the authority of a validated one.
    ///
    /// ⚠ Verified live against an echo upstream, not only here:
    /// `GET /public-state.json` with `X-UAL-User: attacker` arrives at the
    /// upstream as `sawUalUser: null`.
    #[test]
    fn a_client_supplied_identity_header_never_reaches_the_brain() {
        let r = req("POST", "/shutdown", &[("X-UAL-User", "attacker")]);
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upstream_request(&r, &up, "8.8.8.8", None)).unwrap();
        assert!(
            !wire.to_ascii_lowercase().contains("x-ual-user"),
            "the forged identity survived the hop:\n{wire}"
        );
    }

    /// And the inverse: when WE authorized someone, the brain is told who.
    #[test]
    fn the_identity_we_vouched_for_is_the_one_forwarded() {
        let r = req("POST", "/shutdown", &[("X-UAL-User", "attacker")]);
        let up = Upstream::loopback(7525);
        let wire =
            String::from_utf8(build_upstream_request(&r, &up, "127.0.0.1", Some("GFourteen")))
                .unwrap();
        assert!(wire.contains("X-UAL-User: GFourteen"), "{wire}");
        assert!(
            !wire.contains("attacker"),
            "ours must REPLACE theirs, not sit beside it:\n{wire}"
        );
    }

    /// ⚠ Casing must not be a bypass. Headers are lowercased at parse time, and
    /// this asserts the drop keys off that lowercased form.
    #[test]
    fn an_oddly_cased_identity_header_is_dropped_too() {
        for name in ["X-Ual-User", "x-UAL-user", "X-UAL-USER"] {
            let r = req("POST", "/reset", &[(name, "attacker")]);
            let up = Upstream::loopback(7525);
            let wire =
                String::from_utf8(build_upstream_request(&r, &up, "8.8.8.8", None)).unwrap();
            assert!(
                !wire.to_ascii_lowercase().contains("x-ual-user"),
                "{name} survived:\n{wire}"
            );
        }
    }

    #[test]
    fn connection_scoped_headers_do_not_survive_the_hop() {
        let r = req(
            "GET",
            "/public-state.json",
            &[
                ("Connection", "keep-alive"),
                ("Transfer-Encoding", "chunked"),
                ("Upgrade", "websocket"),
                ("Accept", "application/json"),
            ],
        );
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upstream_request(&r, &up, "127.0.0.1", None)).unwrap();
        let lower = wire.to_ascii_lowercase();
        assert!(!lower.contains("transfer-encoding"));
        assert!(!lower.contains("keep-alive"));
        assert!(lower.contains("upgrade") == false, "upgrade must not be blindly forwarded on this lane");
        // A normal header rides through untouched.
        assert!(wire.contains("accept: application/json") || wire.contains("Accept: application/json"));
    }

    /// ⚠ The body length we declare is the body we actually send. A forwarded
    /// stale Content-Length is a request-smuggling primitive.
    #[test]
    fn content_length_is_recomputed_not_forwarded() {
        let mut r = req("POST", "/update", &[("Content-Length", "99999")]);
        r.body = b"{\"confirm\":true}".to_vec();
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upstream_request(&r, &up, "127.0.0.1", Some("Gee"))).unwrap();
        assert!(wire.contains("Content-Length: 16"), "{wire}");
        assert!(!wire.contains("99999"), "the client's length must not survive:\n{wire}");
    }

    #[test]
    fn the_request_target_including_query_is_preserved() {
        let r = req("GET", "/public-state.json?console=50", &[]);
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upstream_request(&r, &up, "127.0.0.1", None)).unwrap();
        assert!(wire.starts_with("GET /public-state.json?console=50 HTTP/1.1\r\n"), "{wire}");
    }

    #[test]
    fn the_real_caller_is_recorded_for_the_brains_own_logs() {
        let r = req("GET", "/public-state.json", &[]);
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upstream_request(&r, &up, "203.0.113.9", None)).unwrap();
        assert!(wire.contains("X-Forwarded-For: 203.0.113.9"), "{wire}");
    }

    #[test]
    fn an_upstream_response_round_trips_status_type_and_body() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 13\r\nX-Custom: yes\r\n\r\n{\"ok\":true}\r\n";
        let r = parse_upstream_response(raw).expect("must parse");
        assert_eq!(r.status, 200);
        assert_eq!(r.content_type, "application/json");
        assert!(String::from_utf8_lossy(&r.body).starts_with("{\"ok\":true}"));
        assert!(r.extra.iter().any(|(k, v)| k == "X-Custom" && v == "yes"));
        // ⚠ Content-Length must NOT be copied — the writer derives it.
        assert!(!r.extra.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-length")));
    }

    #[test]
    fn an_upstream_error_status_is_passed_through_not_masked() {
        let raw = b"HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{\"error\":\"nope\"}";
        let r = parse_upstream_response(raw).expect("must parse");
        assert_eq!(r.status, 403, "the brain's own refusal must reach the caller unchanged");
    }

    /// ⛔ The bug a live request caught. Node answers `/public-state.json`
    /// chunked; stripping the header without decoding hands the caller raw
    /// chunk framing under a Content-Length — HTTP 200, plausible size, corrupt.
    #[test]
    fn a_chunked_upstream_body_is_decoded_not_passed_through_raw() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{\"ok\"\r\n6\r\n:true}\r\n0\r\n\r\n";
        let r = parse_upstream_response(raw).expect("must parse");
        assert_eq!(
            String::from_utf8_lossy(&r.body),
            "{\"ok\":true}",
            "the chunk sizes must not survive into the body"
        );
        assert!(
            !r.extra.iter().any(|(k, _)| k.eq_ignore_ascii_case("transfer-encoding")),
            "a connection-scoped header must not survive the hop"
        );
    }

    #[test]
    fn chunk_extensions_are_ignored_rather_than_breaking_the_parse() {
        assert_eq!(
            decode_chunked(b"4;name=value\r\nabcd\r\n0\r\n\r\n").unwrap(),
            b"abcd"
        );
    }

    #[test]
    fn a_truncated_chunked_body_is_refused_not_half_decoded() {
        // Declares 10 bytes and supplies 4. A partial decode here would look
        // like a valid short payload, which is the worst outcome for a state
        // snapshot.
        assert!(decode_chunked(b"a\r\nabcd").is_none());
        // Missing terminator entirely.
        assert!(decode_chunked(b"4\r\nabcd\r\n").is_none());
    }

    #[test]
    fn an_empty_chunked_body_decodes_to_nothing_rather_than_failing() {
        assert_eq!(decode_chunked(b"0\r\n\r\n").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn an_upgrade_is_recognised_from_both_headers_case_insensitively() {
        assert!(is_websocket_upgrade(&req(
            "GET", "/ws",
            &[("Upgrade", "websocket"), ("Connection", "Upgrade")]
        )));
        // Browsers send a LIST here; a strict equality test would refuse them.
        assert!(is_websocket_upgrade(&req(
            "GET", "/ws",
            &[("Upgrade", "WebSocket"), ("Connection", "keep-alive, Upgrade")]
        )));
    }

    #[test]
    fn a_normal_request_is_not_mistaken_for_an_upgrade() {
        assert!(!is_websocket_upgrade(&req("GET", "/public-state.json", &[])));
        // Half a handshake is not a handshake.
        assert!(!is_websocket_upgrade(&req("GET", "/ws", &[("Upgrade", "websocket")])));
        assert!(!is_websocket_upgrade(&req("GET", "/ws", &[("Connection", "Upgrade")])));
        assert!(!is_websocket_upgrade(&req(
            "GET", "/ws",
            &[("Upgrade", "h2c"), ("Connection", "Upgrade")]
        )));
    }

    /// ⛔ `Upgrade`/`Connection` are dropped on every OTHER request and must
    /// survive this one — otherwise the upstream answers 200 instead of 101 and
    /// the client waits forever for a handshake that already failed.
    #[test]
    fn the_upgrade_headers_survive_the_hop_on_an_upgrade() {
        let r = req(
            "GET", "/ws",
            &[("Upgrade", "websocket"), ("Connection", "Upgrade"),
              ("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ=="),
              ("Sec-WebSocket-Version", "13")],
        );
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upgrade_request(&r, &up, "127.0.0.1", None)).unwrap();
        assert!(wire.contains("Upgrade: websocket"), "{wire}");
        assert!(wire.contains("Connection: Upgrade"), "{wire}");
        // ⛔ The key must pass through byte-for-byte — the accept value is
        // derived from it, so any change makes the client reject the handshake.
        assert!(wire.contains("dGhlIHNhbXBsZSBub25jZQ=="), "{wire}");
        assert!(wire.contains("13"), "the version must survive:\n{wire}");
        assert!(wire.starts_with("GET /ws HTTP/1.1\r\n"), "{wire}");
    }

    /// The identity hygiene is the same on this path as on the normal one.
    #[test]
    fn a_forged_identity_is_dropped_on_the_upgrade_path_too() {
        let r = req(
            "GET", "/ws",
            &[("Upgrade", "websocket"), ("Connection", "Upgrade"),
              ("X-UAL-User", "attacker")],
        );
        let up = Upstream::loopback(7525);
        let wire = String::from_utf8(build_upgrade_request(&r, &up, "8.8.8.8", None)).unwrap();
        assert!(!wire.to_ascii_lowercase().contains("x-ual-user"), "{wire}");

        // ...and the vouched one replaces it rather than joining it.
        let wire2 =
            String::from_utf8(build_upgrade_request(&r, &up, "127.0.0.1", Some("GFourteen"))).unwrap();
        assert!(wire2.contains("X-UAL-User: GFourteen"), "{wire2}");
        assert!(!wire2.contains("attacker"), "{wire2}");
    }

    #[test]
    fn a_garbage_upstream_response_is_refused_rather_than_half_read() {
        assert!(parse_upstream_response(b"not http at all").is_none());
        assert!(parse_upstream_response(b"").is_none());
    }

    #[test]
    fn a_body_containing_the_header_terminator_is_split_at_the_first_one_only() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nbody\r\n\r\nmore";
        let r = parse_upstream_response(raw).unwrap();
        assert_eq!(String::from_utf8_lossy(&r.body), "body\r\n\r\nmore");
    }
}
