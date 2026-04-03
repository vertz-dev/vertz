use std::path::Path;

fn main() {
    // Rebuild when VERTZ_VERSION env var changes (CI sets this).
    println!("cargo:rerun-if-env-changed=VERTZ_VERSION");

    // Rebuild when version.txt changes — catches version bumps that don't touch Rust source.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent() // native/
        .and_then(|p| p.parent()); // repo root
    let version_txt_path = repo_root.map(|root| root.join("version.txt"));

    if let Some(ref path) = version_txt_path {
        println!("cargo:rerun-if-changed={}", path.display());
    }

    // Resolve version: VERTZ_VERSION env var > version.txt > CARGO_PKG_VERSION.
    // Set it via cargo:rustc-env so cli.rs can use env!("VERTZ_VERSION") unconditionally.
    let version = std::env::var("VERTZ_VERSION")
        .ok()
        .filter(|v| !v.is_empty())
        .or_else(|| {
            version_txt_path
                .as_ref()
                .and_then(|p| std::fs::read_to_string(p).ok())
                .map(|s| s.trim().to_string())
                .filter(|v| !v.is_empty())
        })
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    println!("cargo:rustc-env=VERTZ_VERSION={}", version);
}
