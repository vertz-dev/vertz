# Phase 3: Documentation

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial self-review)
- **Commits:** 1c771d5f4..c7091c4f9
- **Date:** 2026-04-05

## Changes

- `packages/mint-docs/guides/debugging.mdx` (new) — Full debugging guide: quick start, VS Code setup, CLI flags, breakpoints, troubleshooting
- `packages/mint-docs/docs.json` (modified) — Added "Runtime" nav group with debugging page
- `packages/mint-docs/runtime.mdx` (modified) — Added --inspect/--inspect-brk to dev server options, cross-reference to debugging guide
- `native/vtz/src/cli.rs` (modified) — Polished --inspect-brk help text to explicitly mention "implies --inspect"

## CI Status

- [x] Quality gates passed at 1c771d5f4
  - `cargo test --all` ✅
  - `cargo clippy --all-targets --release -- -D warnings` ✅
  - `cargo fmt --all -- --check` ✅

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 3: documentation)
- [x] Docs accurately describe implemented behavior
- [x] CLI flag descriptions consistent between docs and code
- [x] Navigation entry correctly placed
- [x] No broken links

## Findings

### Should-fix (resolved)

**S1: Fabricated error message** — Troubleshooting section showed `Error: Inspector address already in use: 127.0.0.1:9229` which does not match the actual `[Server] Failed to start inspector server:` output.
- **Resolution:** Replaced with prose description instead of quoting a specific error format.

**S2: Missing `[Server]` prefix** — `--inspect-brk` terminal output was shown without the `[Server]` prefix that the actual implementation prints.
- **Resolution:** Added `[Server]` prefix to match `persistent_isolate.rs` output.

**S3: Misleading "resumes automatically"** — Stated execution "resumes automatically" after debugger connects, but it actually pauses at the first statement.
- **Resolution:** Clarified that the runtime unblocks then immediately pauses at the first statement, requiring the user to press Resume.

### Notes

**N1:** VS Code `sourceMapPathOverrides` wildcard is a reasonable default but may need per-project tuning.
**N2:** `--inspect-brk` conflicts_with `--inspect` at CLI level — by design, since brk implies inspect.

## Resolution

All should-fix items resolved in commit c7091c4f9. Docs now accurately reflect implementation.

### Approved
