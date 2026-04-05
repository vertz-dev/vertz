// Parity test binary — verifies Rust dev server behavioral parity with Bun dev server.
// Run: cargo test --test parity
// See plans/runtime-parity-tests.md for the full checklist.

mod common;

mod checklist_meta;
mod compilation;
mod http_serving;
// Phase 2
mod hmr;
mod ssr;
// Phase 3
mod auto_features;
mod diagnostics;
mod error_overlay;
