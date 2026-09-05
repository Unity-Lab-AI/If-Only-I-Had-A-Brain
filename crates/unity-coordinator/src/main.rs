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

    let ctx = std::sync::Arc::new(Ctx { proxy_auth, statics, started: std::time::Instant::now() });

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

    let resp = route(&req, &peer, ctx);
    let _ = http::write_response(&mut stream, &resp);
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
                _ if r.access == Access::Privileged => http::Response::json(501, format!(
                    r#"{{"error":"not implemented in unity-coordinator yet","path":"{path}","note":"the privilege gate ALLOWED this caller; the action itself still lives in brain-server.js"}}"#)),
                _ => http::Response::json(501, format!(
                    r#"{{"error":"not implemented in unity-coordinator yet","path":"{path}"}}"#)),
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
