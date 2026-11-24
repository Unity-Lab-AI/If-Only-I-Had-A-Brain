//! v0.3.48 — HER IMAGE LANE ON A DONOR.
//!
//! Her renderer (`server/image-render.py`) is a small local HTTP service on
//! port 5124. When one runs beside this donor (a rented pod's launcher starts
//! it with the same checkpoint), the brain can hand looks and drawings to this
//! card instead of the operator's, which also carries her cortex. The donor
//! only forwards: same JSON request in, same PNG bytes out — so what she sees
//! is the same picture whichever card drew it.
//!
//! Plain `std::net` HTTP/1.1 against 127.0.0.1 — no client crate for one
//! loopback call, and nothing here ever leaves the machine.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const ADDR: &str = "127.0.0.1:5124";

fn request(method: &str, path: &str, body: &[u8], timeout: Duration) -> Result<(u16, Vec<u8>), String> {
    let addr: SocketAddr = ADDR.parse().map_err(|e| format!("{e}"))?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(1500)).map_err(|e| format!("connect: {e}"))?;
    s.set_read_timeout(Some(timeout)).ok();
    s.set_write_timeout(Some(Duration::from_secs(10))).ok();
    let head = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    s.write_all(head.as_bytes()).map_err(|e| format!("write: {e}"))?;
    if !body.is_empty() { s.write_all(body).map_err(|e| format!("write: {e}"))?; }
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).map_err(|e| format!("read: {e}"))?;
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or("no header end")?;
    let headers = String::from_utf8_lossy(&raw[..split]).to_string();
    let status: u16 = headers.split_whitespace().nth(1).and_then(|c| c.parse().ok()).ok_or("no status")?;
    Ok((status, raw[split + 4..].to_vec()))
}

/// Is a renderer answering on this machine?
pub fn local_renderer_alive() -> bool {
    matches!(request("GET", "/health", b"", Duration::from_secs(3)), Ok((200, _)))
}

/// Render one picture: the brain's request body in, PNG bytes out.
pub fn render(body_json: &str, timeout_ms: u64) -> Result<Vec<u8>, String> {
    let (status, body) = request("POST", "/txt2img", body_json.as_bytes(), Duration::from_millis(timeout_ms.max(5000)))?;
    if status != 200 {
        return Err(format!("HTTP {status}: {}", String::from_utf8_lossy(&body[..body.len().min(160)])));
    }
    if body.len() < 8 || &body[1..4] != b"PNG" {
        return Err("renderer answered without a PNG".into());
    }
    Ok(body)
}
