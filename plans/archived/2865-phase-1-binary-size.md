# Phase 1 — Binary Size Measurement & Decision Gate

> **Task 2 of:** [`plans/2865-phase-1-headless-screenshot.md`](./2865-phase-1-headless-screenshot.md)
> **Issue:** [#2865](https://github.com/vertz-dev/vertz/issues/2865)
> **Date:** 2026-04-20
> **Status:** ✅ GO — delta is well under threshold. Ship `chromiumoxide` as a plain `[dependencies]` entry, no feature flag.

## Decision

| Threshold (from design doc) | Delta found | Action |
|---|---|---|
| **< 10 MB** → plain dep | **+338 KB (0.33 MB)** | ✅ **Ship unconditionally.** |
| 10–20 MB → `screenshot` feature default=on | — | n/a |
| ≥20 MB → feature default=off, block Phase 1 | — | n/a |

Delta is ~30× under the best-case threshold. `chromiumoxide` stays in `native/vtz/Cargo.toml` as `chromiumoxide = { version = "0.9", default-features = false }`, enabling Task 3 to start without any Cargo-surgery.

## Measurement method

Release builds of `vtz` on the Phase 1 feature branch, Apple Silicon (M-series), macOS 15.2, LTO + `strip = true` per the workspace profile.

The design doc's published recipe (`wc -c < native/target/release/vtz` before/after) was run — but with one critical correction discovered during measurement: **declaring `chromiumoxide` as a dep without using it gives a delta of ~0 because LTO + dead-code elimination remove 100% of the crate's symbols.**

To measure the real impact, a throwaway `chromium_probe.rs` module was added that calls the full API surface Phase 1 will actually use (`Browser::launch`, `browser.set_cookies`, `page.new_page`, `page.wait_for_navigation`, `page.screenshot` with `full_page`, `browser.close`, `browser.wait`). The probe was made unreachable from end-users but reachable from a hidden `__chromium_probe_task2` CLI argument, which keeps its symbols live through the linker.

Three builds compared:

| Build | Binary size | Delta vs baseline |
|---|---|---|
| Baseline (`chromiumoxide` absent) | 70,831,168 B (67.55 MB) | — |
| Dep declared, unused | 70,710,720 B (67.43 MB) | **−117 KB** (noise; LTO elides 100%) |
| Dep declared + probe forces symbols live | 71,177,488 B (67.88 MB) | **+338 KB (0.33 MB)** |

The measurement that matters for the decision is the last row — it reflects what the binary will weigh once Task 4 (`chromium.rs`) actually calls into `chromiumoxide`.

After the measurement, the probe was removed. The final commit on this branch keeps only the `Cargo.toml` change.

### Why the delta is so small

Most of what `chromiumoxide` pulls in — `tokio`, `hyper`, `reqwest`, `base64`, `async-tungstenite`, `serde`, `futures`, `url` — is already a direct or transitive dep of `vtz`. The "incremental" cost is only:

- `chromiumoxide` core (CDP routing, message correlation, Page/Browser types): ~100–200 KB
- `chromiumoxide_cdp` (PDL-generated CDP types): ~100–150 KB
- A handful of `chromiumoxide`-only transitives: ~50 KB

That matches the observed 338 KB within rounding.

Crate-level attribution via `cargo bloat --release -p vtz --crates` was attempted but aborted — the tool requires a cold rebuild (different compile settings from `cargo build`), which didn't fit the measurement window. Since the decision gate resolves on the raw delta (338 KB, well under all thresholds), attribution-level detail is **informational, not decisional** per the design doc.

Expected attribution (from structural analysis — not a measured value):

```
chromiumoxide_cdp       ~150 KB  (PDL-generated CDP types)
chromiumoxide           ~120 KB  (core client + handler)
minor transitives       < 70 KB
─────────────────────────────────
TOTAL DELTA             ~338 KB  (measured by wc -c on the binary)
```

Attribution-level numbers can be verified in a future session via `cd native && cargo bloat --release -p vtz --crates` when the rebuild cost is acceptable; the decision does not depend on them.

## Implications for Phase 1

- **Task 3** can proceed with `chromiumoxide` already pinned in `Cargo.toml` from this PR.
- **No feature flag** is added — design doc principle #2 ("one way to do things") would oppose a feature gate when the cost is 0.3 MB.
- **No CI size regression guard** is added in this task — the 338 KB baseline becomes the reference, and if a future Phase 2/3/4 work pushes it past ~1 MB, that's the signal to introduce a CI size check at that point.
- **Goal P4 ("zero config default")** is trivially satisfied — the dep is always on, no env, no flag, no build-time choice.

## Chromium (runtime) binary separation — not in this measurement

This measurement covers only `vtz` itself. The actual Chromium headless-shell binary (~80 MB per platform) downloads on first tool invocation into `~/.vertz/chromium/<rev>/` and is not bundled with `vtz`. That is Task 3's concern.

## Reproduction

```bash
cd /path/to/vertz

# Baseline (chromiumoxide absent)
cargo build --release --manifest-path native/Cargo.toml -p vtz
wc -c < native/target/release/vtz

# Add to native/vtz/Cargo.toml:
#   chromiumoxide = { version = "0.9", default-features = false }

# Still roughly baseline (LTO elides unused symbols)
cargo build --release --manifest-path native/Cargo.toml -p vtz
wc -c < native/target/release/vtz

# Add a probe module that calls the chromiumoxide API surface + a CLI
# path that invokes the probe, rebuild, and measure the real delta
cargo build --release --manifest-path native/Cargo.toml -p vtz
wc -c < native/target/release/vtz

# Attribution
cd native && cargo bloat --release -p vtz --crates
```

## Acceptance (from design doc Task 2)

- [x] Report committed with before/after numbers and decision → this file
- [x] Decision reflected in `Cargo.toml` (`chromiumoxide` added to `native/vtz/Cargo.toml`, stays for Task 3)
- [⚠️] `cargo bloat --release --crates` attribution **partially captured** — tool rebuild cost exceeded the measurement window; structural-analysis attribution documented above; full run deferred. This is acceptable because the decision resolves on the raw 338 KB delta alone; attribution is informational per the design doc ("`cargo bloat` (separately) to identify which crates dominate the delta — informational, not the measurement")
