# Module URL Canonicalization — Cross-Module instanceof Failures

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft |
| 2 | 2026-03-29 | Address review findings: macOS /tmp canonicalization, brand hierarchy design, E2E test fix, clarify source-vs-dist scope, add canonicalization cache, add Node/Element base stubs |

---

## Problem

~50 test files fail in the native runtime due to `instanceof` checks failing across ES module boundaries. The root cause is module identity duplication: deno_core caches modules by their resolved URL, and the same source file can be loaded under two different URLs.

### Three mechanisms:

1. **Non-canonical paths (~30-35 failures)** — Two subcategories:
   - **Path normalization:** Relative imports like `../../lib/../lib/utils.ts` produce paths with `..` components. The same physical file imported via a bare specifier (which goes through symlink canonicalization in `resolve_node_module`) gets a different URL. `std::fs::canonicalize()` fixes this by normalizing both paths to the same canonical form.
   - **Symlink divergence:** Workspace symlinks in `node_modules/@vertz/*` point to `packages/*/`. When a file is reached via the symlink path vs. a relative path that traverses into the same directory, the URLs differ. `canonicalize()` resolves both to the same physical path.

   **Important clarification:** Canonicalization fixes cases where two *different URL paths* reach the *same physical file*. It does NOT fix source-vs-dist duplication (where `dist/index.js` and `src/index.ts` are genuinely different files). Source-vs-dist resolution is deferred as a non-goal (see below). The ~30-35 estimate is based on the path-normalization and symlink-divergence scenarios, not source-vs-dist.

2. **Happy-DOM DOM classes missing (~15 failures)** — UI tests need `HTMLElement`, `HTMLDivElement`, etc. The runtime's SSR DOM shim provides `SSRElement` which doesn't share the `HTMLElement` prototype chain. Tests doing `instanceof HTMLElement` fail.

3. **Minor edge cases (<5 failures)** — Third-party packages re-exporting polyfilled versions of standard classes.

## API Surface

This is a Rust-only change with no TypeScript API surface. The observable behavior change is:

```typescript
// Before: fails when same physical file is reached via two URL paths
// (e.g., node_modules/@vertz/errors -> packages/errors/dist/index.js via symlink
//  vs. ../../packages/errors/dist/index.js via relative path)
import { AppError } from '@vertz/errors';              // via symlink
import { AppError as AE } from '../../packages/errors/dist/index.js'; // via relative
new AE('test', 'TEST') instanceof AppError;             // ❌ different module URL

// After: both paths canonicalize to the same file:// URL
new AE('test', 'TEST') instanceof AppError;             // ✅ same module identity
```

For `Symbol.hasInstance` (defense-in-depth), uses a `__brands` array to support multi-level inheritance:

```typescript
class FetchError extends Error {
  readonly __brands: readonly string[] = ['VertzFetchError'];

  static [Symbol.hasInstance](obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || !('__brands' in obj)) return false;
    const brands = (obj as { __brands: readonly string[] }).__brands;
    return Array.isArray(brands) && brands.includes('VertzFetchError');
  }
}

class HttpError extends FetchError {
  readonly __brands: readonly string[] = ['VertzHttpError', 'VertzFetchError'];
  // Inherits FetchError[Symbol.hasInstance] — checks for 'VertzFetchError' in __brands ✅
  // Also defines own Symbol.hasInstance for 'VertzHttpError' checks

  static [Symbol.hasInstance](obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || !('__brands' in obj)) return false;
    const brands = (obj as { __brands: readonly string[] }).__brands;
    return Array.isArray(brands) && brands.includes('VertzHttpError');
  }
}

class FetchBadRequestError extends HttpError {
  readonly __brands: readonly string[] = ['VertzFetchBadRequestError', 'VertzHttpError', 'VertzFetchError'];
  // new FetchBadRequestError() instanceof FetchError ✅ (brands includes 'VertzFetchError')
  // new FetchBadRequestError() instanceof HttpError ✅ (brands includes 'VertzHttpError')
}
```

For test-mode DOM stubs:

```typescript
// In test preload: globalThis gets stub classes with proper prototype chain
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLDivElement extends HTMLElement {}
// ... enough for instanceof, no DOM behavior needed
```

## Manifesto Alignment

- **Principle 2 (Zero-Config)** — Canonicalization is invisible to the developer. `instanceof` just works.
- **Principle 5 (Predictable Runtime)** — Same class imported via different paths should be identical. Module identity must match file identity.
- **Principle 8 (LLM-Friendly)** — AI agents expect `instanceof` to work without workarounds. Unpredictable module identity is a productivity trap.

## Non-Goals

1. **CJS/ESM interop** — ~40 failures from CJS-only dependencies are a separate module system effort.
2. **Full DOM implementation in test mode** — Stubs only need to exist for `instanceof`, not full DOM behavior.
3. **Workspace source resolution in test mode** — Resolving `@vertz/*` to `src/index.ts` instead of `dist/index.js` during test execution. This would fix source-vs-dist duplication (genuinely different files) and is a valuable optimization, but it is architecturally distinct from path canonicalization. Tracked as a follow-up. Canonicalization addresses the same-physical-file-different-URL problem.
4. **Cross-realm `instanceof` (e.g., iframes, Workers)** — Out of scope for a file-based runtime.

## Unknowns

None remaining. All resolved during review:

1. **Performance impact of `canonicalize()`** — Resolved: use a `RefCell<HashMap<PathBuf, PathBuf>>` cache. Module resolution is called once per unique import, cache is bounded (typically <500 entries). Cache added to `VertzModuleLoader` struct alongside existing `source_maps` HashMap.

2. **macOS `/tmp` → `/private/tmp` canonicalization breaking tests** — Resolved: existing Rust tests use `tempfile::tempdir()` which returns `/tmp/...` paths on macOS. After canonicalization, resolved paths become `/private/tmp/...`. Tests must canonicalize expected paths too: `util_file.canonicalize().unwrap()`.

## Type Flow Map

No generic type parameters introduced. This is a Rust infrastructure change + TypeScript brand additions.

## E2E Acceptance Test

```typescript
// Integration test: same class via genuinely different import paths
import { describe, it, expect } from '@vertz/test';

describe('Module URL canonicalization', () => {
  it('instanceof works for classes imported via bare specifier', async () => {
    const { AppError } = await import('@vertz/errors');
    const err = new AppError('test', 'TEST_CODE');
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('same class imported via bare specifier and relative path has same identity', async () => {
    // Import via bare specifier (goes through node_modules symlink)
    const mod1 = await import('@vertz/errors');
    // Import via relative path that reaches the same physical dist/index.js
    // (the exact path depends on the test file location relative to packages/errors/dist/)
    const mod2 = await import('../../packages/errors/dist/index.js');
    expect(mod1.AppError === mod2.AppError).toBe(true);
    expect(new mod2.AppError('x', 'X') instanceof mod1.AppError).toBe(true);
  });
});
```

---

## Implementation Plan

### Phase 1: URL Canonicalization in Module Loader

**Goal:** Add `std::fs::canonicalize()` with caching to all resolved file paths before converting to `file://` URLs.

**Changes:**
- `native/vertz-runtime/src/runtime/module_loader.rs`:
  - Add `canon_cache: RefCell<HashMap<PathBuf, PathBuf>>` field to `VertzModuleLoader`
  - In `resolve()`, after `resolve_specifier()` returns, canonicalize via cache-or-syscall
  - Update existing tests to canonicalize expected paths (`expected.canonicalize().unwrap()`)

**Implementation:**
```rust
pub struct VertzModuleLoader {
    root_dir: PathBuf,
    source_maps: SourceMapStore,
    canon_cache: RefCell<HashMap<PathBuf, PathBuf>>,
}

impl VertzModuleLoader {
    pub fn new(root_dir: &str) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
        }
    }

    fn canonicalize_cached(&self, path: &Path) -> PathBuf {
        if let Some(cached) = self.canon_cache.borrow().get(path) {
            return cached.clone();
        }
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        self.canon_cache.borrow_mut().insert(path.to_path_buf(), canonical.clone());
        canonical
    }
}

// In resolve():
let resolved_path = self.resolve_specifier(specifier, &referrer_path)?;
let canonical_path = self.canonicalize_cached(&resolved_path);
let url = ModuleSpecifier::from_file_path(&canonical_path).map_err(|_| {
    deno_core::anyhow::anyhow!("Cannot convert path to URL: {}", canonical_path.display())
})?;
```

**Acceptance Criteria:**
```typescript
describe('Phase 1: URL canonicalization', () => {
  describe('Given a file imported via a path with .. components', () => {
    describe('When the same file is imported via a direct path', () => {
      it('Then both resolve to the same module URL', () => {
        // Rust test: create tmp/src/main.ts and tmp/src/lib/utils.ts
        // Import from main.ts as "../lib/../lib/utils" and "./lib/utils"
        // Both should resolve to the same canonical file:// URL
      });
    });
  });

  describe('Given a workspace package symlinked in node_modules', () => {
    describe('When imported via bare specifier and via relative path to same file', () => {
      it('Then both resolve to the same module URL', () => {
        // Rust test: create symlink, import via both paths
        // Verify identical ModuleSpecifier
      });
    });
  });

  describe('Given existing tests with tempdir paths', () => {
    describe('When canonicalization is applied (macOS /tmp -> /private/tmp)', () => {
      it('Then all existing tests still pass with canonicalized expected paths', () => {});
    });
  });
});
```

**Quality gates:** `cargo test -p vertz-runtime`

### Phase 2: Test-Mode DOM Class Stubs

**Goal:** Provide stub DOM classes with proper prototype chain on `globalThis` when running `vertz test`.

**Changes:**
- `native/vertz-runtime/src/test/globals.rs` — Add DOM class stubs to the test harness JS.

**Implementation:**
```javascript
// In TEST_HARNESS_JS, before test discovery:
if (typeof globalThis.HTMLElement === 'undefined') {
  class Node {}
  class Element extends Node {}
  class HTMLElement extends Element {}
  class HTMLDivElement extends HTMLElement {}
  class HTMLInputElement extends HTMLElement {}
  class HTMLButtonElement extends HTMLElement {}
  class HTMLFormElement extends HTMLElement {}
  class HTMLAnchorElement extends HTMLElement {}
  class HTMLSpanElement extends HTMLElement {}
  class HTMLLabelElement extends HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {}
  class HTMLSelectElement extends HTMLElement {}
  class HTMLOptionElement extends HTMLElement {}
  class HTMLImageElement extends HTMLElement {}
  class Text extends Node {}
  class Comment extends Node {}
  class DocumentFragment extends Node {}
  class Event {}
  class CustomEvent extends Event {}
  class EventTarget {}

  Object.assign(globalThis, {
    Node, Element, EventTarget, Event, CustomEvent,
    HTMLElement, HTMLDivElement, HTMLInputElement, HTMLButtonElement,
    HTMLFormElement, HTMLAnchorElement, HTMLSpanElement, HTMLLabelElement,
    HTMLTextAreaElement, HTMLSelectElement, HTMLOptionElement, HTMLImageElement,
    Text, Comment, DocumentFragment,
  });
}
```

**Acceptance Criteria:**
```typescript
describe('Phase 2: DOM class stubs in test mode', () => {
  describe('Given vertz test runtime with no DOM environment', () => {
    describe('When code checks instanceof HTMLElement', () => {
      it('Then the check does not throw (class exists on globalThis)', () => {});
    });

    describe('When checking instanceof Node on an HTMLElement instance', () => {
      it('Then returns true (proper prototype chain: HTMLElement -> Element -> Node)', () => {});
    });
  });
});
```

**Quality gates:** `cargo test -p vertz-runtime`

### Phase 3: Symbol.hasInstance on Critical Error Classes

**Goal:** Add `Symbol.hasInstance` brand checks using `__brands` array pattern to support multi-level inheritance.

**Changes:**
- `packages/errors/src/app-error.ts` — Add `__brands` + `Symbol.hasInstance`
- `packages/errors/src/fetch.ts` — Add to `FetchError`, `HttpError`, `ParseError`, and all HTTP error subclasses
- `packages/errors/src/entity.ts` — Add to `EntityError` and all subclasses

**Brand hierarchy:**

| Class | `__brands` array |
|---|---|
| `AppError` | `['VertzAppError']` |
| `FetchError` | `['VertzFetchError']` |
| `HttpError` | `['VertzHttpError', 'VertzFetchError']` |
| `FetchBadRequestError` | `['VertzFetchBadRequestError', 'VertzHttpError', 'VertzFetchError']` |
| `FetchNotFoundError` | `['VertzFetchNotFoundError', 'VertzHttpError', 'VertzFetchError']` |
| *(other HTTP errors)* | `['Vertz<ClassName>', 'VertzHttpError', 'VertzFetchError']` |
| `FetchNetworkError` | `['VertzFetchNetworkError', 'VertzFetchError']` |
| `FetchTimeoutError` | `['VertzFetchTimeoutError', 'VertzFetchError']` |
| `ParseError` | `['VertzParseError', 'VertzFetchError']` |
| `FetchValidationError` | `['VertzFetchValidationError', 'VertzFetchError']` |
| `EntityError` | `['VertzEntityError']` |
| `BadRequestError` | `['VertzBadRequestError', 'VertzEntityError']` |
| *(other entity errors)* | `['Vertz<ClassName>', 'VertzEntityError']` |

Each class's `Symbol.hasInstance` checks `brands.includes('OwnBrandString')`. Subclass instances include parent brands in their array, so `new FetchBadRequestError() instanceof FetchError` works because `__brands` contains `'VertzFetchError'`.

**Existing type guards** (`isFetchNetworkError`, etc.) use `return error instanceof FooError` internally. These will automatically benefit from `Symbol.hasInstance` — no changes needed to type guard functions. The `instanceof` operator calls the class's `[Symbol.hasInstance]`, which checks the brand array.

**Implementation pattern:**
```typescript
export class FetchError extends Error {
  readonly __brands: readonly string[] = ['VertzFetchError'];

  static [Symbol.hasInstance](obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || !('__brands' in obj)) return false;
    const brands = (obj as { __brands: readonly string[] }).__brands;
    return Array.isArray(brands) && brands.includes('VertzFetchError');
  }
}
```

**Acceptance Criteria:**
```typescript
describe('Phase 3: Symbol.hasInstance brand checks', () => {
  describe('Given FetchBadRequestError with __brands array', () => {
    describe('When checking instanceof FetchError (grandparent)', () => {
      it('Then returns true (brands includes VertzFetchError)', () => {});
    });

    describe('When checking instanceof HttpError (parent)', () => {
      it('Then returns true (brands includes VertzHttpError)', () => {});
    });
  });

  describe('Given a plain object with matching __brands', () => {
    describe('When checking instanceof AppError', () => {
      it('Then returns true (brand check, not prototype check)', () => {});
    });
  });

  describe('Given an object without __brands', () => {
    describe('When checking instanceof AppError', () => {
      it('Then returns false', () => {});
    });
  });

  describe('Given existing type guard functions', () => {
    describe('When isFetchNotFoundError is called with a branded object', () => {
      it('Then returns true (type guard uses instanceof which uses Symbol.hasInstance)', () => {});
    });
  });
});
```

**Quality gates:** `bun test packages/errors` + `bun run typecheck`

### Phase 4: Verification — Run Full Test Suite on Native Runtime

**Goal:** Verify net reduction of test file failures.

**Changes:** No code changes. Run `vertz test` against the full monorepo and measure failure count.

**Acceptance Criteria:**
- `@vertz/errors` test suite stays 100% green
- `@vertz/schema` instanceof tests pass
- `@vertz/fetch` error instanceof tests pass
- No regressions in currently-passing tests
- Document the actual failure reduction count

---

## Dependencies Between Phases

- Phase 1 (canonicalization) is independent and provides the largest impact
- Phase 2 (DOM stubs) is independent of Phase 1
- Phase 3 (Symbol.hasInstance) is independent but provides defense-in-depth for cases Phase 1 can't fix
- Phase 4 (verification) depends on all prior phases

Phases 1, 2, and 3 can be implemented in parallel but will be done sequentially for clean review.

---

## Review Sign-offs

### DX Review — APPROVED
- Addressed: E2E test now tests genuinely different import paths (not same specifier twice)
- Addressed: Brand hierarchy fully specified with `__brands` array pattern
- Addressed: DOM stubs include `Node`, `Element`, `Event`, `EventTarget` base classes
- Addressed: Type guards explicitly noted as automatically benefiting from `Symbol.hasInstance`

### Product/Scope Review — APPROVED
- Addressed: Clarified that canonicalization fixes same-file-different-URL, NOT source-vs-dist
- Addressed: Non-goal #3 explicitly notes workspace source resolution as a follow-up
- Addressed: DOM stub list to be validated against actual test failures during implementation

### Technical Review — APPROVED with all should-fix items addressed
- Addressed: macOS `/tmp` → `/private/tmp` canonicalization breaking tests (canonicalize expected paths)
- Addressed: `Symbol.hasInstance` subclass hierarchy via `__brands` array
- Addressed: Canonicalization cache is non-optional (added to struct)
- Addressed: `Node`, `Element` base classes added to DOM stubs
- Addressed: E2E test tests genuinely different paths
