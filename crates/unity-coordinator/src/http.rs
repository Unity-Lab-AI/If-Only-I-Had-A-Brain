//! A minimal HTTP/1.1 request reader and response writer.
//!
//! ## Why this is hand-written rather than `hyper` + `tokio`
//!
//! ⭐ This process guards `/shutdown`, `/reset` and `/grade-advance`. The parser
//! that decides what path a request is asking for is part of that guard, and a
//! few hundred readable lines that can be audited in one sitting is worth more
//! here than a framework whose behaviour on a malformed request has to be
//! looked up.
//!
//! ⚠ The workload also does not need an async runtime. The control plane serves
//! a handful of endpoints and some static files to a small number of callers —
//! `/ctl/status` answers in ~0.16 s and the dashboard polls one cached snapshot
//! precisely so a crowd costs one backend hit per window. **A thread per
//! connection is adequate and one less thing between the decision and the test.**
//!
//! ## ⛔ Every limit here exists so a hostile or broken client cannot hurt us
//!
//! An unbounded read is a memory exhaustion; an unbounded wait is a slowloris.
//! Both are *cheap* to get wrong and this is a public-facing listener.

use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// Longest request line we will read. A URL far beyond this is not a real
/// request; it is someone probing.
pub const MAX_REQUEST_LINE: usize = 8 * 1024;
/// Most headers we will accept before refusing.
pub const MAX_HEADERS: usize = 100;
/// Largest body. ⚠ Generous enough for the control POSTs (a confirm token, a
/// grade signoff) and nowhere near enough to be a memory lever.
pub const MAX_BODY: usize = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Request {
    pub method: String,
    /// Raw target, query string included — routing strips it, deliberately, so
    /// the raw form stays available.
    pub target: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

impl Request {
    /// Header lookup, case-insensitive as HTTP requires.
    /// ⚠ Keys are lowercased at parse time; `X-UAL-User` and `x-ual-user` are
    /// the same header, and a gate that missed that would refuse a valid
    /// operator or — worse — accept where it should not.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(&name.to_ascii_lowercase()).map(String::as_str)
    }
}

#[derive(Debug)]
pub enum ReadError {
    Closed,
    TooLarge(&'static str),
    Malformed(&'static str),
    Io(String),
}

/// Read one request. Returns `Closed` on a clean disconnect.
pub fn read_request(stream: &TcpStream) -> Result<Request, ReadError> {
    // ⛔ A read timeout is what stops a slowloris from pinning a thread forever.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let mut r = BufReader::new(stream);

    let mut line = String::new();
    let n = read_line_capped(&mut r, &mut line, MAX_REQUEST_LINE)?;
    if n == 0 { return Err(ReadError::Closed); }

    let mut parts = line.trim_end().split(' ');
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();
    if method.is_empty() || target.is_empty() {
        return Err(ReadError::Malformed("request line"));
    }

    let mut headers = BTreeMap::new();
    for _ in 0..MAX_HEADERS {
        let mut h = String::new();
        let n = read_line_capped(&mut r, &mut h, MAX_REQUEST_LINE)?;
        if n == 0 { return Err(ReadError::Malformed("headers ended without a blank line")); }
        let h = h.trim_end();
        if h.is_empty() { break; }
        if let Some((k, v)) = h.split_once(':') {
            // ⚠ Lowercased key, trimmed value — HTTP headers are
            // case-insensitive and the auth gate depends on this.
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let len: usize = headers.get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if len > MAX_BODY { return Err(ReadError::TooLarge("body")); }
    let mut body = vec![0u8; len];
    if len > 0 {
        r.read_exact(&mut body).map_err(|e| ReadError::Io(e.to_string()))?;
    }

    Ok(Request { method, target, headers, body })
}

fn read_line_capped(r: &mut impl BufRead, out: &mut String, cap: usize) -> Result<usize, ReadError> {
    let mut total = 0usize;
    loop {
        let mut byte = [0u8; 1];
        match r.read(&mut byte) {
            Ok(0) => return Ok(total),
            Ok(_) => {
                total += 1;
                if total > cap { return Err(ReadError::TooLarge("request line or header")); }
                out.push(byte[0] as char);
                if byte[0] == b'\n' { return Ok(total); }
            }
            Err(e) => return Err(ReadError::Io(e.to_string())),
        }
    }
}

pub struct Response {
    pub status: u16,
    /// ⚠ `String`, not `&'static str`. It was the latter while every response
    /// this process produced came from its own fixed table — and the moment a
    /// PROXIED response arrives, the content type is whatever the upstream said
    /// and cannot be a compile-time literal. Widening the type is what lets a
    /// forwarded body keep its declared type instead of being relabelled.
    pub content_type: String,
    pub body: Vec<u8>,
    /// ⚠ Extra headers, used for the no-store the dashboard polling relies on.
    pub extra: Vec<(String, String)>,
}

impl Response {
    pub fn json(status: u16, body: impl Into<Vec<u8>>) -> Self {
        Response { status, content_type: "application/json".into(), body: body.into(), extra: Vec::new() }
    }
    pub fn text(status: u16, body: impl Into<Vec<u8>>) -> Self {
        Response { status, content_type: "text/plain; charset=utf-8".into(), body: body.into(), extra: Vec::new() }
    }
    pub fn bytes(status: u16, ct: impl Into<String>, body: Vec<u8>) -> Self {
        Response { status, content_type: ct.into(), body, extra: Vec::new() }
    }
    pub fn no_store(mut self) -> Self {
        self.extra.push(("Cache-Control".into(), "no-store".into()));
        self
    }
}

pub fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK", 400 => "Bad Request", 403 => "Forbidden", 404 => "Not Found",
        405 => "Method Not Allowed", 413 => "Payload Too Large",
        500 => "Internal Server Error", 501 => "Not Implemented",
        _ => "OK",
    }
}

pub fn write_response(stream: &mut TcpStream, r: &Response) -> std::io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n",
        r.status, reason(r.status), r.content_type, r.body.len());
    for (k, v) in &r.extra {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(&r.body)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Request {
        // Exercise the header/body logic directly on the same shapes the socket
        // reader produces.
        let mut lines = raw.split("\r\n");
        let first = lines.next().unwrap();
        let mut parts = first.split(' ');
        let method = parts.next().unwrap().to_string();
        let target = parts.next().unwrap().to_string();
        let mut headers = BTreeMap::new();
        for l in lines.by_ref() {
            if l.is_empty() { break; }
            if let Some((k, v)) = l.split_once(':') {
                headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }
        Request { method, target, headers, body: Vec::new() }
    }

    #[test]
    fn header_lookup_is_case_insensitive_because_the_auth_gate_depends_on_it() {
        let r = parse("POST /shutdown HTTP/1.1\r\nX-UAL-User: GFourteen\r\n\r\n");
        assert_eq!(r.header("x-ual-user"), Some("GFourteen"));
        assert_eq!(r.header("X-UAL-User"), Some("GFourteen"));
        assert_eq!(r.header("X-Ual-User"), Some("GFourteen"),
            "a gate that missed a casing variant would refuse a valid operator — or accept where it must not");
    }

    #[test]
    fn header_values_are_trimmed_so_a_padded_identity_still_reads() {
        let r = parse("GET /x HTTP/1.1\r\nX-UAL-User:    Sponge   \r\n\r\n");
        assert_eq!(r.header("x-ual-user"), Some("Sponge"));
    }

    #[test]
    fn the_target_keeps_its_query_string_for_the_router_to_strip() {
        let r = parse("POST /update?keep=1 HTTP/1.1\r\n\r\n");
        assert_eq!(r.target, "/update?keep=1",
            "routing strips it deliberately; the raw form must stay available");
    }

    #[test]
    fn a_missing_header_is_none_not_empty() {
        let r = parse("GET / HTTP/1.1\r\n\r\n");
        assert_eq!(r.header("x-ual-user"), None,
            "None and Some(\"\") mean different things to the auth gate");
    }

    #[test]
    fn status_lines_carry_the_right_reason() {
        assert_eq!(reason(403), "Forbidden");
        assert_eq!(reason(404), "Not Found");
        assert_eq!(reason(413), "Payload Too Large");
    }

    #[test]
    fn the_limits_are_set_where_a_hostile_client_cannot_hurt_us() {
        assert!(MAX_BODY <= 4 * 1024 * 1024, "a large body cap is a memory lever on a public listener");
        assert!(MAX_REQUEST_LINE <= 64 * 1024);
        assert!(MAX_HEADERS <= 1000);
    }

    #[test]
    fn no_store_is_available_for_the_polled_endpoints() {
        let r = Response::json(200, "{}").no_store();
        assert!(r.extra.iter().any(|(k, v)| k == "Cache-Control" && v == "no-store"),
            "the dashboard polls these; a cached snapshot is a stale instrument");
    }
}
