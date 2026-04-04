# Phase 1: Implement Missing Expect Matchers

## Context

The vtz test runner (`native/vtz/src/test/globals.rs`) is missing four commonly-used expect matchers: `toStrictEqual`, `toBeNaN`, `toHaveBeenNthCalledWith`, and `toSatisfy`. These are standard vitest/jest matchers needed for test migration. All implementation happens in the `TEST_HARNESS_JS` string literal within `globals.rs`.

Design doc: `plans/2258-expect-matchers.md`
Issue: #2258

## Tasks

### Task 1: Add `strictDeepEqual` helper and `toStrictEqual` matcher

**Files:**
- `native/vtz/src/test/globals.rs` (modified)

**What to implement:**

1. Add a `strictDeepEqual(a, b, seen)` function near the existing `deepEqual` function (~line 233). This function:
   - Delegates to asymmetric matchers (same as `deepEqual`)
   - Uses `Object.is(a, b)` for identity check
   - Checks `a.constructor !== b.constructor` — fails if constructors differ
   - Uses `WeakSet` for circular reference protection (same as `deepEqual`)
   - Handles Date, RegExp, Map, Set (same as `deepEqual` but recurses with `strictDeepEqual`)
   - For arrays: uses `Object.hasOwn(a, i)` to detect sparse holes vs `undefined`
   - For objects: uses `Object.keys()` + `Object.hasOwn(b, k)` for symmetric key check

2. Add `matchers.toStrictEqual` in `createMatchers()` after `matchers.toEqual` (~line 321):
   ```js
   matchers.toStrictEqual = (expected) => {
     assert(strictDeepEqual(actual, expected), () =>
       `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to strictly equal ${formatValue(expected)}`
     );
   };
   ```

3. Add `'toStrictEqual'` to the `builtinNames` array in `createAsyncMatchers()` (~line 604).

4. Add Rust test functions following existing patterns (e.g., `test_to_equal_deep`):
   - `test_to_strict_equal_same_class` — same constructor, same shape passes
   - `test_to_strict_equal_different_class` — different constructor fails
   - `test_to_strict_equal_undefined_vs_missing` — `{a: 1, b: undefined}` !== `{a: 1}`
   - `test_to_strict_equal_sparse_array` — `[1,,3]` !== `[1, undefined, 3]`
   - `test_to_strict_equal_plain_objects` — plain objects with same shape pass
   - `test_to_strict_equal_not` — `.not.toStrictEqual` works correctly

**Acceptance criteria:**
- [ ] `expect(new Foo(1)).toStrictEqual(new Foo(1))` passes
- [ ] `expect(new Foo(1)).not.toStrictEqual(new Bar(1))` passes (different constructors)
- [ ] `expect({a:1, b:undefined}).not.toStrictEqual({a:1})` passes (undefined vs missing)
- [ ] `expect([1,,3]).not.toStrictEqual([1,undefined,3])` passes (sparse vs undefined)
- [ ] `.resolves.toStrictEqual()` works (builtinNames updated)
- [ ] All existing tests still pass

---

### Task 2: Add `toBeNaN` matcher

**Files:**
- `native/vtz/src/test/globals.rs` (modified)

**What to implement:**

1. Add `matchers.toBeNaN` in `createMatchers()` in the "Numbers" section (~line 370):
   ```js
   matchers.toBeNaN = () => {
     assert(Number.isNaN(actual), () =>
       `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be NaN`
     );
   };
   ```

2. Add `'toBeNaN'` to the `builtinNames` array in `createAsyncMatchers()`.

3. Add Rust tests:
   - `test_to_be_nan` — `NaN` and `0/0` pass
   - `test_to_be_nan_not` — numbers and strings fail, `.not` works

**Acceptance criteria:**
- [ ] `expect(NaN).toBeNaN()` passes
- [ ] `expect(0/0).toBeNaN()` passes
- [ ] `expect(42).not.toBeNaN()` passes
- [ ] `expect('hello').not.toBeNaN()` passes

---

### Task 3: Add `toHaveBeenNthCalledWith` matcher

**Files:**
- `native/vtz/src/test/globals.rs` (modified)

**What to implement:**

1. Add `matchers.toHaveBeenNthCalledWith` in `createMatchers()` after `toHaveBeenLastCalledWith` (~line 557):
   ```js
   matchers.toHaveBeenNthCalledWith = (n, ...expectedArgs) => {
     if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenNthCalledWith requires a mock function');
     if (typeof n !== 'number' || n < 1 || !Number.isInteger(n)) throw new Error('toHaveBeenNthCalledWith: n must be a positive integer');
     const nthCall = actual.mock.calls[n - 1]; // 1-indexed
     assert(nthCall !== undefined && deepEqual(nthCall, expectedArgs), () =>
       `Expected mock ${negated ? 'not ' : ''}to have been nth(${n}) called with ${formatValue(expectedArgs)}, ` +
       (nthCall === undefined ? `but it was only called ${actual.mock.calls.length} times` : `got ${formatValue(nthCall)}`)
     );
   };
   ```

2. Add `'toHaveBeenNthCalledWith'` to the `builtinNames` array in `createAsyncMatchers()`.

3. Add Rust tests:
   - `test_to_have_been_nth_called_with` — checks 1st, 2nd, 3rd call args
   - `test_to_have_been_nth_called_with_not` — `.not` works
   - `test_to_have_been_nth_called_with_invalid_n` — n=0 and n<0 throw
   - `test_to_have_been_nth_called_with_out_of_range` — n > call count fails

**Acceptance criteria:**
- [ ] `expect(fn).toHaveBeenNthCalledWith(1, 'first')` passes after `fn('first')`
- [ ] `expect(fn).toHaveBeenNthCalledWith(2, 'second', 42)` passes after `fn('first'); fn('second', 42)`
- [ ] `expect(fn).not.toHaveBeenNthCalledWith(1, 'wrong')` passes
- [ ] `expect(fn).toHaveBeenNthCalledWith(0, 'x')` throws "positive integer" (even with `.not`)
- [ ] `expect(fn).toHaveBeenNthCalledWith(99, 'x')` fails (assert, not throw)

---

### Task 4: Add `toSatisfy` matcher

**Files:**
- `native/vtz/src/test/globals.rs` (modified)

**What to implement:**

1. Add `matchers.toSatisfy` in `createMatchers()` before the custom matchers section (~line 559):
   ```js
   matchers.toSatisfy = (predicate) => {
     if (typeof predicate !== 'function') throw new Error('toSatisfy: predicate must be a function');
     assert(predicate(actual), () =>
       `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to satisfy predicate`
     );
   };
   ```

2. Add `'toSatisfy'` to the `builtinNames` array in `createAsyncMatchers()`.

3. Add Rust tests:
   - `test_to_satisfy` — positive predicate passes
   - `test_to_satisfy_not` — `.not` works
   - `test_to_satisfy_invalid_predicate` — non-function throws (even with `.not`)

**Acceptance criteria:**
- [ ] `expect(3).toSatisfy(n => n > 0 && n < 10)` passes
- [ ] `expect('hello').toSatisfy(s => s.startsWith('h'))` passes
- [ ] `expect(42).not.toSatisfy(n => n < 0)` passes
- [ ] `expect(1).toSatisfy('not a function')` throws "predicate must be a function"
