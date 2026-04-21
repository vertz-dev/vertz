//! Screenshot subsystem for the Vertz dev server.
//!
//! Phase 1 scope (per `plans/2865-phase-1-headless-screenshot.md`):
//! headless screenshot MCP tool that captures any route the dev server
//! serves, saves PNGs as artifacts, and returns them as MCP image
//! content blocks plus a local URL.
//!
//! Submodules:
//! - `artifacts` — filename generation, disk persistence

pub mod artifacts;
pub mod chromium;
pub mod fetcher;
pub mod pool;
