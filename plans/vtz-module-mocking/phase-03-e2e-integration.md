# Phase 3: End-to-End Integration Tests

## Context

Phases 1-2 implement the compiler transform and wire it into the runtime. This phase validates the complete flow end-to-end by running real test files through `vtz test` with module mocking.

Design doc: `plans/vtz-module-mocking.md`

## Tasks

### Task 1: Test fixtures — mock test files

**Files:**
- `native/vtz/tests/fixtures/mock-named-imports.test.ts` (new)
- `native/vtz/tests/fixtures/mock-default-import.test.ts` (new)
- `native/vtz/tests/fixtures/mock-namespace-import.test.ts` (new)

**What to implement:**

Create test fixture files that exercise each import rewriting pattern. Each fixture is a complete test file that `vtz test` will compile and execute.

**Fixture 1: Named imports** (`mock-named-imports.test.ts`)
```ts
import { describe, it, expect, vi } from '@vertz/test';
// This import targets a fixture module we'll create
import { add, multiply } from './mock-math-module';

vi.mock('./mock-math-module', () => ({
  add: vi.fn().mockReturnValue(42),
  multiply: vi.fn().mockReturnValue(100),
}));

describe('named import mocking', () => {
  it('returns mock value from add', () => {
    expect(add(1, 2)).toBe(42);
  });
  it('returns mock value from multiply', () => {
    expect(multiply(3, 4)).toBe(100);
  });
  it('mocks are vi.fn instances', () => {
    add(1, 2);
    expect(add).toHaveBeenCalledWith(1, 2);
  });
});
```

**Fixture 2: Default import** (`mock-default-import.test.ts`)
```ts
import { describe, it, expect, vi, mock } from '@vertz/test';
import createClient from './mock-client-module';

mock.module('./mock-client-module', () => ({
  default: vi.fn().mockReturnValue({ connected: true }),
}));

describe('default import mocking', () => {
  it('returns mock default', () => {
    const client = createClient();
    expect(client.connected).toBe(true);
  });
});
```

**Fixture 3: Namespace import** (`mock-namespace-import.test.ts`)
```ts
import { describe, it, expect, vi } from '@vertz/test';
import * as utils from './mock-math-module';

vi.mock('./mock-math-module', () => ({
  add: vi.fn().mockReturnValue(99),
  multiply: vi.fn().mockReturnValue(200),
}));

describe('namespace import mocking', () => {
  it('accesses mock via namespace', () => {
    expect(utils.add(1, 2)).toBe(99);
    expect(utils.multiply(3, 4)).toBe(200);
  });
});
```

Also create the target modules:
- `native/vtz/tests/fixtures/mock-math-module.ts`: `export function add(a, b) { return a + b; } export function multiply(a, b) { return a * b; }`
- `native/vtz/tests/fixtures/mock-client-module.ts`: `export default function createClient() { return { connected: false }; }`

**Acceptance criteria:**
- [x] All 3 fixture test files are valid TypeScript
- [x] Target modules have real implementations (to verify mocks actually intercept)

---

### Task 2: Test fixtures — hoisted and importActual

**Files:**
- `native/vtz/tests/fixtures/mock-hoisted.test.ts` (new)
- `native/vtz/tests/fixtures/mock-import-actual.test.ts` (new)

**What to implement:**

**Fixture 4: vi.hoisted()** (`mock-hoisted.test.ts`)
```ts
import { describe, it, expect, vi } from '@vertz/test';
import { add } from './mock-math-module';

const { mockAdd } = vi.hoisted(() => ({
  mockAdd: vi.fn().mockReturnValue(999),
}));

vi.mock('./mock-math-module', () => ({
  add: mockAdd,
}));

describe('vi.hoisted()', () => {
  it('factory references hoisted variable', () => {
    expect(add(1, 2)).toBe(999);
  });
  it('hoisted mock is the same instance', () => {
    expect(add).toBe(mockAdd);
  });
});
```

**Fixture 5: vi.importActual()** (`mock-import-actual.test.ts`)
```ts
import { describe, it, expect, vi } from '@vertz/test';
import { add, multiply } from './mock-math-module';

vi.mock('./mock-math-module', async () => {
  const actual = await vi.importActual('./mock-math-module');
  return {
    ...actual,
    add: vi.fn().mockReturnValue(0), // Override only add
  };
});

describe('vi.importActual()', () => {
  it('add is mocked', () => {
    expect(add(1, 2)).toBe(0);
  });
  it('multiply is the real implementation', () => {
    expect(multiply(3, 4)).toBe(12);
  });
});
```

**Acceptance criteria:**
- [x] Hoisted variable is accessible in mock factory
- [x] `vi.importActual()` returns the real module
- [x] Partial mocking (override some exports, keep others) works

---

### Task 3: E2E execution test in Rust

**Files:**
- `native/vtz/src/test/executor.rs` tests (extend `#[cfg(test)]`)

**What to implement:**

Add integration tests that call `execute_test_file_with_options()` on the fixture files and verify all tests pass:

```rust
#[test]
fn test_mock_named_imports() {
    let result = execute_test_file_with_options(
        Path::new("tests/fixtures/mock-named-imports.test.ts"),
        &ExecuteOptions { root_dir: Some(PathBuf::from("tests/fixtures")), ..Default::default() },
    );
    assert!(result.file_error.is_none(), "File error: {:?}", result.file_error);
    assert!(result.tests.iter().all(|t| t.passed), "Some tests failed: {:?}", result.tests);
}
```

Repeat for all 5 fixtures.

Also add a **regression test** — a test file with NO mocks to verify the transform doesn't break non-mocking files:

```rust
#[test]
fn test_no_mocks_regression() {
    // Use an existing simple test fixture that doesn't use vi.mock()
    let result = execute_test_file_with_options(
        Path::new("tests/fixtures/basic-test.test.ts"),
        &ExecuteOptions { root_dir: Some(PathBuf::from("tests/fixtures")), ..Default::default() },
    );
    assert!(result.file_error.is_none());
    assert!(result.tests.iter().all(|t| t.passed));
}
```

And a **mock isolation test** — verify mocks from one file don't leak to another:

```rust
#[test]
fn test_mock_isolation_between_files() {
    // Execute a file that mocks ./mock-math-module
    let result1 = execute_test_file_with_options(
        Path::new("tests/fixtures/mock-named-imports.test.ts"),
        &ExecuteOptions { root_dir: Some(PathBuf::from("tests/fixtures")), ..Default::default() },
    );
    assert!(result1.tests.iter().all(|t| t.passed));

    // Execute another file that imports the REAL module (no mocking)
    // The real module should be loaded, not the mock from the previous file
    let result2 = execute_test_file_with_options(
        Path::new("tests/fixtures/mock-isolation-verify.test.ts"),
        &ExecuteOptions { root_dir: Some(PathBuf::from("tests/fixtures")), ..Default::default() },
    );
    assert!(result2.tests.iter().all(|t| t.passed));
}
```

Create `mock-isolation-verify.test.ts`:
```ts
import { describe, it, expect } from '@vertz/test';
import { add } from './mock-math-module';

describe('mock isolation', () => {
  it('gets the REAL add function, not a mock', () => {
    expect(add(2, 3)).toBe(5); // Real implementation returns actual sum
  });
});
```

**Acceptance criteria:**
- [x] All 5 mock fixture tests pass via `execute_test_file_with_options()`
- [x] Non-mocking test file passes (regression)
- [x] Mock isolation between files verified (fresh V8 runtime per file)
- [x] Mixed mocked + non-mocked imports work in the same file

---

### Task 4: Diagnostic tests

**Files:**
- `native/vtz/tests/fixtures/mock-nested-error.test.ts` (new)
- `native/vtz/tests/fixtures/mock-no-factory-error.test.ts` (new)
- `native/vertz-compiler-core/src/mock_hoisting.rs` tests (extend)

**What to implement:**

Verify that compile-time diagnostics are emitted correctly:

1. **Nested mock error:** Create a fixture with `vi.mock()` inside a function body. Compile it with `mock_hoisting: true` and verify the diagnostics contain the expected error message.

2. **No factory error:** Create a fixture with `vi.mock('module')` (no factory). Compile and verify error diagnostic.

3. **Unused mock warning:** Create a fixture with `vi.mock('nonexistent', () => ({}))` where 'nonexistent' has no matching import. Compile and verify warning diagnostic.

These are compiler-level tests (not E2E execution tests). Use `vertz_compiler_core::compile()` directly.

**Acceptance criteria:**
- [x] `vi.mock()` inside `it()` produces error diagnostic with line number
- [x] `vi.mock('mod')` without factory produces error diagnostic
- [x] `vi.mock('typo', factory)` with no matching import produces warning diagnostic
- [x] Diagnostic messages include actionable fix suggestions
