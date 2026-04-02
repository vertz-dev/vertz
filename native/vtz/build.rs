fn main() {
    // Ensure Cargo rebuilds when VERTZ_VERSION changes (used by option_env! in cli.rs)
    println!("cargo:rerun-if-env-changed=VERTZ_VERSION");
}
