# Phase 1: Split the DOM shim into permanent + scoped sections

## Context

Issue #2760 requires server handlers to see a Cloudflare-Workers-like environment (no `window`, no `document`, no DOM constructors). See the design doc at `plans/2760-browser-detection-fix.md` for full background.

This phase restructures `native/vtz/src/ssr/dom_shim.rs` into two JS blocks registered at snapshot time:

1. **Permanent block** — CSS collector state and functions, DOM-constructor class definitions (captured in closure, not set on `globalThis`), `navigator`, and registration of the two install/uninstall functions.
2. **Install/uninstall functions** — toggle the browser-confusing subset (`window`, `document`, `location`, `history`, event APIs, DOM constructors) on `globalThis`.

The install/uninstall functions are registered but NOT wired into the SSR dispatch path in this phase — that's Phase 2. At end of Phase 1, running the current SSR render path still works because we install the shim eagerly at snapshot time (same as today) to avoid breaking anything. The new functions exist in parallel, ready for Phase 2 wiring.

**Key design points:**
- CSS collector state (`__vertz_collected_css`) must move from an IIFE-closed `const` to `globalThis.__vertz_css_state` (an array) so it survives across install/uninstall cycles and is accessible from both the permanent block and install calls.
- DOM constructor functions (`SSRDocument`, `SSRElement`, etc.) stay defined inside a permanent-block closure. The install function copies references into `globalThis`; uninstall deletes them.
- Install is idempotent (guarded by a flag). Uninstall is idempotent (same flag). Reinstall between renders resets the document and CSS collector.

## Tasks

### Task 1.1: Write failing tests for install/uninstall behavior (RED)

**Files:** (2)
- `native/vtz/src/ssr/dom_shim.rs` (modified — add test cases to the existing `tests` module at the bottom)
- `native/vtz/src/runtime/snapshot.rs` (modified — the existing `test_production_snapshot_has_bootstrap_globals` test may need adjustment; keep it passing by only asserting things we keep in the permanent block)

**What to implement:**

Add these Rust tests to `dom_shim.rs::tests` module. They MUST fail before implementation:

```rust
#[test]
fn test_install_uninstall_functions_are_registered() {
    // After snapshot restore, both functions exist on globalThis
    let mut rt = VertzJsRuntime::new_for_production(...).unwrap();
    let result = rt.execute_script("<t>",
        "typeof globalThis.__vertz_install_dom_shim === 'function' && \
         typeof globalThis.__vertz_uninstall_dom_shim === 'function'"
    ).unwrap();
    assert_eq!(result.as_bool(), Some(true));
}

#[test]
fn test_install_sets_window_and_document() {
    // After calling install, window and document are defined
    // After calling uninstall, they are deleted
    // Call install again — document is a fresh SSRDocument
}

#[test]
fn test_uninstall_removes_browser_globals() {
    // window, document, location, history, HTMLElement, Element, addEventListener
    // are all undefined after uninstall
}

#[test]
fn test_css_collector_state_is_permanent() {
    // __vertz_inject_css exists even before install
    // __vertz_inject_css accumulates entries across multiple install/uninstall cycles
    // install clears the collector (fresh per render)
}

#[test]
fn test_navigator_is_permanent() {
    // navigator is defined before any install; has userAgent property
}

#[test]
fn test_install_is_idempotent() {
    // Calling install twice in a row does not reset state between calls
}
```

**Acceptance criteria:**
- [ ] All new tests compile
- [ ] All new tests FAIL with clear messages (functions not yet registered, state not moved)
- [ ] Existing tests in `dom_shim.rs::tests` still document current behavior (will change in Task 1.2)

---

### Task 1.2: Restructure dom_shim.rs to split permanent + scoped (GREEN)

**Files:** (1)
- `native/vtz/src/ssr/dom_shim.rs` (modified — rewrite `DOM_SHIM_JS` body)

**What to implement:**

Restructure the JS string `DOM_SHIM_JS` as follows. Use literal JS; do not introduce a templating system.

1. **Permanent block** (outer IIFE that runs once at snapshot time):
   - Define all DOM constructor classes as `const` inside the IIFE closure (`SSRDocument`, `SSRElement`, `SSRText`, `SSRComment`, etc. — already exist, just ensure they're not set on `globalThis` here).
   - Install the CSS collector state as a non-enumerable property on `globalThis`:
     ```js
     Object.defineProperty(globalThis, '__vertz_css_state', {
       value: [],
       writable: true,
       configurable: false,
       enumerable: false,
     });
     ```
   - Install `globalThis.__vertz_inject_css`, `__vertz_get_collected_css`, `__vertz_clear_collected_css`. These now reference `globalThis.__vertz_css_state` (not the closure `const`).
   - Install `globalThis.navigator` with Worker-compatible shape (`{ userAgent: 'vertz-server/1.0', language: 'en', languages: ['en'], platform: 'server', onLine: true }`).
   - Install `URLSearchParams` polyfill **only if** `typeof globalThis.URLSearchParams === 'undefined'`. (deno_core likely provides it; confirm by reading the current code — if already guarded with this check, keep as-is.)

2. **Install/uninstall functions** (defined in the same IIFE, so they close over the DOM constructor `const`s):
   ```js
   let __vertz_shim_installed = false;
   globalThis.__vertz_install_dom_shim = function () {
     if (__vertz_shim_installed) return;
     __vertz_shim_installed = true;
     globalThis.window = globalThis;
     globalThis.document = new SSRDocument();
     globalThis.location = {
       href: 'http://localhost/', origin: 'http://localhost',
       protocol: 'http:', host: 'localhost', hostname: 'localhost',
       port: '', pathname: '/', search: '', hash: '',
     };
     globalThis.history = {
       pushState(){}, replaceState(){}, back(){}, forward(){}, go(){},
       state: null, length: 1,
     };
     globalThis.addEventListener = function(){};
     globalThis.removeEventListener = function(){};
     globalThis.dispatchEvent = function(){ return true; };
     globalThis.HTMLElement = SSRElement;
     globalThis.Element = SSRElement;
     globalThis.Text = SSRText;
     globalThis.Document = SSRDocument;
     globalThis.DocumentFragment = SSRDocumentFragment;
     globalThis.Node = SSRNode;
     globalThis.Comment = SSRComment;
     // Reset collector for this render
     globalThis.__vertz_css_state.length = 0;
   };
   globalThis.__vertz_uninstall_dom_shim = function () {
     if (!__vertz_shim_installed) return;
     __vertz_shim_installed = false;
     delete globalThis.window;
     delete globalThis.document;
     delete globalThis.location;
     delete globalThis.history;
     delete globalThis.addEventListener;
     delete globalThis.removeEventListener;
     delete globalThis.dispatchEvent;
     delete globalThis.HTMLElement;
     delete globalThis.Element;
     delete globalThis.Text;
     delete globalThis.Document;
     delete globalThis.DocumentFragment;
     delete globalThis.Node;
     delete globalThis.Comment;
   };
   ```

3. **Eager install at snapshot time** — to keep Phase 1 a refactor (not a behavioral change), execute `globalThis.__vertz_install_dom_shim()` at the end of the permanent block. This means the production snapshot still has `window`/`document` installed — Phase 2 will remove this eager call and wire install/uninstall into dispatch.

**Acceptance criteria:**
- [ ] All Task 1.1 tests pass
- [ ] All pre-existing `dom_shim.rs::tests` still pass (behavior preserved)
- [ ] `cargo clippy --all-targets -- -D warnings` clean for the `native/vtz` crate
- [ ] `cargo fmt --all -- --check` clean
- [ ] `cargo test --all` green

---

### Task 1.3: Re-run handler-reachability grep, fail CI on unclassified hits

**Files:** (2)
- `scripts/audit-window-document-refs.sh` (new — bash script)
- `.github/workflows/ci.yml` (modified — add one step that invokes the script)

**What to implement:**

A shell script that greps for unguarded module-level references to `window.`, `document.`, `location.`, `history.` in a curated set of packages transitively reachable from server handlers:

```bash
#!/usr/bin/env bash
# scripts/audit-window-document-refs.sh
# Fails if any handler-reachable module has an unguarded top-level `window.X` or `document.X` access.
set -euo pipefail

PACKAGES=(
  "packages/ui/src"
  "packages/server/src"
  "packages/agents/src"
  "packages/forms/src"
  "packages/codegen/src"
  "packages/ui-server/src"
)

# Allowlist of expected FN-GATED references (see plans/2760-browser-detection-fix.md audit table).
# Any hit NOT in this list causes the script to fail.
ALLOWLIST_REGEX='(env/is-browser\.ts|router/reactive-search-params\.ts|router/view-transitions\.ts|router/navigate\.ts|router/server-nav\.ts|auth/auth-context\.ts|auth/create-access-provider\.ts|query/query\.ts)'

# find hits, excluding __tests__ and .test.ts files, excluding node_modules
hits=$(grep -rn -E '(window|document|location|history)\.' "${PACKAGES[@]}" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=__tests__ --exclude-dir=node_modules \
  | grep -v '\.test\.ts' \
  | grep -v -E "$ALLOWLIST_REGEX" \
  || true)

if [ -n "$hits" ]; then
  echo "::error::Unclassified handler-reachable DOM references found:"
  echo "$hits"
  echo "Add the file to the allowlist in scripts/audit-window-document-refs.sh (after reviewing)"
  echo "or refactor to gate with isBrowser() / typeof X !== 'undefined'."
  exit 1
fi
echo "Handler-reachable DOM reference audit: OK"
```

And CI workflow:
```yaml
- name: Audit handler-reachable DOM references
  run: bash scripts/audit-window-document-refs.sh
```

**Acceptance criteria:**
- [ ] Script is executable and passes on the current tree (all existing references are either in the allowlist or in `__tests__`)
- [ ] Script fails if a new file references `window.X` at top level without `typeof` guard (verify by temporarily adding a test fixture, then reverting)
- [ ] CI step runs in the standard PR workflow

---

## Quality Gates

Before merging Phase 1:
- `cargo test --all` (Rust tests pass)
- `cargo clippy --all-targets -- -D warnings` (no warnings)
- `cargo fmt --all -- --check` (format clean)
- `vtz test` (TS tests unchanged)
- `vtz run typecheck` (unchanged)
- `vtz run lint` (unchanged)
- `bash scripts/audit-window-document-refs.sh` (new — passes)

## Adversarial Review

After Phase 1 green, spawn a review agent to verify:
- Install/uninstall function bodies exactly match design (no drift)
- CSS collector state on `globalThis` is non-enumerable and non-configurable where specified
- Eager install at end of permanent block preserves today's behavior (no user-visible regression)
- Audit script does not have false positives (won't block an unrelated PR touching an ok file)

Write review to `reviews/2760-browser-detection-fix/phase-01-split-dom-shim.md`.
