//! Static file serving, with the traversal check that makes it safe.
//!
//! ⛔⛔ **THE HAZARD IS PATH TRAVERSAL AND IT IS NOT THEORETICAL.** This process
//! runs with read access to the whole backend directory — the trained weights,
//! `identity-core.json`, `.env`, the deploy key's `known_hosts`. A static route
//! that resolves `../` is a credential leak, not a 404.
//!
//! ⭐ **The check is CANONICALISATION, not string filtering.** Rejecting
//! literal `..` is the tempting version and it is insufficient: URL-encoded
//! forms, mixed separators on Windows, and symlinks all get past a substring
//! test. Resolving the real path and asserting it is still under the root is the
//! only form that closes all three at once.
//!
//! ⚠ And the root itself is canonicalised **once**, at construction — comparing
//! against an unresolved root would fail the moment the root contained a symlink
//! or a `.` component, which is exactly when someone would "fix" the check by
//! weakening it.

use std::path::{Path, PathBuf};

pub struct StaticRoot {
    root: PathBuf,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Served {
    File { bytes: Vec<u8>, content_type: &'static str },
    /// Not found under the root. ⚠ Returned for traversal attempts TOO — an
    /// attacker learns nothing from a 404 that they would learn from a 403.
    NotFound,
}

impl StaticRoot {
    pub fn new(root: impl AsRef<Path>) -> std::io::Result<Self> {
        Ok(StaticRoot { root: root.as_ref().canonicalize()? })
    }

    /// Resolve a URL path under the root, or refuse.
    pub fn resolve(&self, url_path: &str) -> Option<PathBuf> {
        let path = url_path.split(['?', '#']).next().unwrap_or(url_path);
        let path = percent_decode(path);
        // Strip the leading slash; a leading separator would make `join` treat
        // it as absolute and escape the root entirely.
        let rel = path.trim_start_matches('/');
        if rel.is_empty() { return None; }

        // ⛔ Reject NUL and any absolute/drive-letter form before touching the
        // filesystem. `C:\windows\...` joined onto a root is not under it.
        if rel.contains('\0') || rel.contains(':') { return None; }

        let joined = self.root.join(rel);
        // ⭐ THE CHECK. Canonicalise, then assert containment. A file that does
        // not exist canonicalises to an error, which is the 404 path.
        let real = joined.canonicalize().ok()?;
        if real.starts_with(&self.root) { Some(real) } else { None }
    }

    pub fn serve(&self, url_path: &str) -> Served {
        let Some(p) = self.resolve(url_path) else { return Served::NotFound };
        if !p.is_file() { return Served::NotFound; }
        match std::fs::read(&p) {
            Ok(bytes) => Served::File { bytes, content_type: content_type_for(&p) },
            Err(_) => Served::NotFound,
        }
    }
}

/// Minimal percent-decoding. ⚠ Present because `%2e%2e%2f` is `../` and a check
/// that ran before decoding would wave it straight through.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            if let Some(v) = hex { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn content_type_for(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "wasm" => "application/wasm",
        "onnx" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> (PathBuf, StaticRoot) {
        let mut d = std::env::temp_dir();
        d.push(format!("unity-static-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("html")).unwrap();
        std::fs::write(d.join("html/index.html"), b"<html>ok</html>").unwrap();
        std::fs::write(d.join("app.js"), b"console.log(1)").unwrap();
        // A secret ABOVE the root — the thing traversal would be after.
        std::fs::write(d.parent().unwrap().join("unity-secret.txt"), b"DEPLOY KEY").unwrap();
        let sr = StaticRoot::new(&d).unwrap();
        (d, sr)
    }

    #[test]
    fn serves_a_real_file_with_the_right_content_type() {
        let (_d, s) = root();
        match s.serve("/html/index.html") {
            Served::File { bytes, content_type } => {
                assert_eq!(bytes, b"<html>ok</html>");
                assert_eq!(content_type, "text/html; charset=utf-8");
            }
            other => panic!("expected a file, got {other:?}"),
        }
        match s.serve("/app.js") {
            Served::File { content_type, .. } => assert_eq!(content_type, "text/javascript; charset=utf-8"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn plain_dot_dot_traversal_is_refused() {
        let (_d, s) = root();
        assert_eq!(s.serve("/../unity-secret.txt"), Served::NotFound);
        assert_eq!(s.serve("/html/../../unity-secret.txt"), Served::NotFound);
        assert_eq!(s.serve("/./../../unity-secret.txt"), Served::NotFound);
    }

    #[test]
    fn percent_encoded_traversal_is_refused_because_decoding_happens_first() {
        // ⛔ %2e%2e%2f is ../ — a check that ran before decoding would wave this
        // straight through to the deploy key.
        let (_d, s) = root();
        assert_eq!(s.serve("/%2e%2e/unity-secret.txt"), Served::NotFound);
        assert_eq!(s.serve("/%2E%2E%2Funity-secret.txt"), Served::NotFound);
        assert_eq!(s.serve("/html/%2e%2e/%2e%2e/unity-secret.txt"), Served::NotFound);
    }

    #[test]
    fn an_absolute_or_drive_qualified_path_is_refused_before_the_filesystem() {
        let (_d, s) = root();
        // `join` on an absolute path REPLACES the root — the classic escape.
        assert_eq!(s.serve("/C:/Windows/win.ini"), Served::NotFound);
        assert_eq!(s.serve("//etc/passwd"), Served::NotFound);
    }

    #[test]
    fn a_nul_byte_is_refused() {
        let (_d, s) = root();
        assert_eq!(s.serve("/html/index.html\0.png"), Served::NotFound);
    }

    #[test]
    fn a_directory_is_not_served_as_a_file() {
        let (_d, s) = root();
        assert_eq!(s.serve("/html"), Served::NotFound,
            "listing or streaming a directory is not something this needs to do");
    }

    #[test]
    fn an_empty_path_is_refused_rather_than_resolving_to_the_root() {
        let (_d, s) = root();
        assert_eq!(s.serve("/"), Served::NotFound);
        assert_eq!(s.serve(""), Served::NotFound);
    }

    #[test]
    fn a_query_string_does_not_become_part_of_the_filename() {
        let (_d, s) = root();
        assert!(matches!(s.serve("/app.js?v=123"), Served::File { .. }),
            "cache-busting query strings are normal and must not 404");
    }

    #[test]
    fn a_missing_file_is_not_found_not_an_error() {
        let (_d, s) = root();
        assert_eq!(s.serve("/nope.html"), Served::NotFound);
    }

    #[test]
    fn traversal_and_missing_return_the_SAME_verdict() {
        // ⚠ An attacker must not be able to distinguish "exists but refused"
        // from "does not exist" — that difference is a directory oracle.
        let (_d, s) = root();
        assert_eq!(s.serve("/../unity-secret.txt"), s.serve("/definitely-not-here.txt"));
    }
}
