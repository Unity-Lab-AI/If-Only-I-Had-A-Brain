//! Answer a batch of privilege-gate cases so the JS parity harness can compare
//! them against the shipped `requireLoopback`.
//!
//! ⛔ Exists because a Rust-only test of this gate proves nothing about whether
//! it MATCHES the server that is actually running. The gate is the thing
//! standing between the internet and `/shutdown`; the only check worth having is
//! the two implementations agreeing on the same inputs.
//!
//! Input: a JSON array of `{a: addr, pa: proxyAuth, u: ualUser|null}`.
//! Output: a JSON array of `{ok, status, body}`.

use unity_http::{check, Access};

/// Minimal field extraction — the harness controls the input shape, so a full
/// JSON parser would be a dependency bought for nothing.
fn field<'a>(obj: &'a str, key: &str) -> Option<&'a str> {
    let pat = format!("\"{key}\":");
    let i = obj.find(&pat)? + pat.len();
    Some(obj[i..].trim_start())
}

fn json_string(v: &str) -> Option<String> {
    if !v.starts_with('"') { return None; }
    let mut out = String::new();
    let mut it = v[1..].chars();
    while let Some(c) = it.next() {
        match c {
            '"' => return Some(out),
            '\\' => match it.next() {
                Some('t') => out.push('\t'),
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('\\') => out.push('\\'),
                Some('"') => out.push('"'),
                Some(o) => out.push(o),
                None => break,
            },
            _ => out.push(c),
        }
    }
    None
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\t', "\\t").replace('\r', "\\r")
}

fn main() {
    let p = std::env::args().nth(1).expect("usage: auth_probe <cases.json>");
    let raw = std::fs::read_to_string(p).expect("cannot read cases");

    // Split top-level objects.
    let mut objs = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (i, c) in raw.char_indices() {
        match c {
            '{' => { if depth == 0 { start = i; } depth += 1; }
            '}' => { depth -= 1; if depth == 0 { objs.push(&raw[start..=i]); } }
            _ => {}
        }
    }

    let mut out = Vec::with_capacity(objs.len());
    for o in objs {
        let addr = field(o, "a").and_then(json_string).unwrap_or_default();
        let pa = field(o, "pa").map(|v| v.starts_with("true")).unwrap_or(false);
        let uraw = field(o, "u").unwrap_or("null");
        let user = if uraw.starts_with("null") { None } else { json_string(uraw) };

        let r = check(&Access::Privileged, &addr, pa, user.as_deref());
        out.push(match r {
            Ok(()) => "{\"ok\":true,\"status\":0,\"body\":\"\"}".to_string(),
            Err(d) => format!("{{\"ok\":false,\"status\":{},\"body\":\"{}\"}}", d.status(), escape(d.body())),
        });
    }
    println!("[{}]", out.join(","));
}
