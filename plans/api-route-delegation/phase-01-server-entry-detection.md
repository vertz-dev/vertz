# Phase 1: Extend Server Entry Detection

## Context

The Rust dev server's `detect_server_entry()` in `config.rs` only checks `src/server.ts` and `src/server.tsx`. The TypeScript `detectAppType()` in `app-detector.ts` also checks `src/api/server.{ts,tsx,js}` as a fallback and supports `.js` extensions. This phase adds parity with the Bun detector by adding `.js` extension support and the `src/api/` fallback.

Design doc: `plans/2304-api-route-delegation.md` (Gap 1)

## Tasks

### Task 1: Extend `detect_server_entry()` with `.js` extension and `src/api/` fallback

**Files:** (3)
- `native/vtz/src/config.rs` (modified)

**What to implement:**

Update `detect_server_entry()` to:
1. Add `"server.js"` to the candidates list (after `server.tsx`)
2. After checking `src/server.{ts,tsx,js}`, check `src/api/server.{ts,tsx,js}` as a fallback
3. Keep `src/server.ts` > `src/server.tsx` > `src/server.js` > `src/api/server.ts` > `src/api/server.tsx` > `src/api/server.js` precedence

The target signature (from design doc):
```rust
fn detect_server_entry(src_dir: &Path) -> Option<PathBuf> {
    let candidates = ["server.ts", "server.tsx", "server.js"];
    // 1. Check src/server.{ts,tsx,js} (preferred)
    for candidate in &candidates {
        let path = src_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    // 2. Check src/api/server.{ts,tsx,js} (fallback — matches Bun detector)
    let api_dir = src_dir.join("api");
    for candidate in &candidates {
        let path = api_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    None
}
```

**Acceptance criteria:**
- [ ] `detect_server_entry()` returns `src/server.js` when only `.js` exists
- [ ] `detect_server_entry()` returns `src/api/server.ts` when no top-level server entry exists
- [ ] `detect_server_entry()` returns `src/api/server.tsx` when only that exists in `src/api/`
- [ ] `detect_server_entry()` returns `src/api/server.js` when only that exists in `src/api/`
- [ ] `src/server.ts` is preferred over `src/api/server.ts` when both exist (parity test)
- [ ] `src/server.ts` is preferred over `src/server.js` (extension priority within same dir)
- [ ] Existing tests still pass (`.ts`, `.tsx`, priority, `None` cases)
