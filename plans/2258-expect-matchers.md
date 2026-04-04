# Design: Add Missing Expect Matchers to vtz Test Runner

**Issue:** #2258
**Date:** 2026-04-04

## API Surface

All matchers follow the existing vitest/jest API contract. Users write standard test assertions — no new concepts.

### `toStrictEqual(expected)`

Strict deep equality that checks class identity and distinguishes `undefined` properties from missing properties.

```ts
// Class identity
class Dog { constructor(public name: string) {} }
class Cat { constructor(public name: string) {} }

expect(new Dog('Rex')).toStrictEqual(new Dog('Rex'));   // pass
expect(new Dog('Rex')).not.toStrictEqual(new Cat('Rex')); // pass — different constructors

// Undefined vs missing
expect({ a: 1, b: undefined }).not.toStrictEqual({ a: 1 }); // pass — b: undefined !== missing b
expect({ a: 1 }).not.toStrictEqual({ a: 1, b: undefined }); // pass

// Sparse arrays
expect([1, , 3]).not.toStrictEqual([1, undefined, 3]); // pass — hole !== undefined

// Falls back to deep equality for plain objects
expect({ a: { b: 1 } }).toStrictEqual({ a: { b: 1 } }); // pass
```

### `toBeNaN()`

Checks that the received value is `NaN`.

```ts
expect(NaN).toBeNaN();          // pass
expect(0 / 0).toBeNaN();       // pass
expect(42).not.toBeNaN();      // pass
expect('hello').not.toBeNaN(); // pass
```

### `toHaveBeenNthCalledWith(n, ...args)`

Checks the arguments of the Nth call (1-indexed) on a mock function.

```ts
const fn = vi.fn();
fn('first');
fn('second', 42);
fn('third');

expect(fn).toHaveBeenNthCalledWith(1, 'first');       // pass
expect(fn).toHaveBeenNthCalledWith(2, 'second', 42);  // pass
expect(fn).toHaveBeenNthCalledWith(3, 'third');        // pass
expect(fn).not.toHaveBeenNthCalledWith(1, 'second');   // pass

// Error on invalid n (throws before assert — bypasses .not negation)
expect(fn).toHaveBeenNthCalledWith(0, 'first');  // throws: n must be a positive integer
expect(fn).toHaveBeenNthCalledWith(-1, 'x');     // throws: n must be a positive integer
expect(fn).not.toHaveBeenNthCalledWith(0, 'x');  // still throws — validation precedes assert()
expect(fn).toHaveBeenNthCalledWith(4, 'fourth'); // fails via assert(): only called 3 times
```

### `toSatisfy(predicate)`

Runs a custom predicate function against the received value.

```ts
expect(3).toSatisfy((n) => n > 0 && n < 10);        // pass
expect('hello').toSatisfy((s) => s.startsWith('h')); // pass
expect(42).not.toSatisfy((n) => n < 0);              // pass

// Predicate must be a function (throws before assert — bypasses .not negation)
expect(1).toSatisfy('not a function');       // throws: predicate must be a function
expect(1).not.toSatisfy('not a function');   // still throws — validation precedes assert()

// Predicate errors propagate (not caught by the matcher)
expect(null).toSatisfy((n) => n.foo.bar);    // throws: TypeError from predicate
```

## Manifesto Alignment

### Principle 3: AI agents are first-class users
All four matchers follow the exact vitest/jest API — an LLM generating test code will use these correctly on the first try because the API is already well-known.

### Principle 5: If you can't test it, don't build it
These matchers fill gaps that prevent developers from migrating tests to vtz. `toStrictEqual` in particular is critical for testing class-based code and distinguishing structural nuances.

### Principle 7: Performance is not optional
All matchers are pure JavaScript in the harness — no V8↔Rust boundary crossing per assertion. The `toStrictEqual` implementation uses a `strictDeepEqual` function that adds minimal overhead over the existing `deepEqual`.

### Tradeoff: One way to do things
`toStrictEqual` vs `toEqual` is an intentional distinction (matching vitest/jest). Both are needed — `toEqual` for "shape matches", `toStrictEqual` for "exact structural identity". This is not ambiguity; they serve different testing needs.

## Non-Goals

- **Snapshot matchers** (`toMatchSnapshot`, `toMatchInlineSnapshot`) — different architecture needed (file I/O, update mode). Tracked separately.
- **Remaining medium-priority matchers** (`toBeFinite`, `toBePositive`, `toBeNegative`, `toHaveReturned*`) — can be added later. Not blocking any migration.
- **Tagged template `it.each`** — parser change, not a matcher. Out of scope.
- **Custom asymmetric matchers for these** — the matchers are standard assertions, not asymmetric combinators.

## Unknowns

None identified. All four matchers have well-defined semantics from vitest/jest and the implementation patterns are established in the existing codebase.

## POC Results

Not applicable — the implementation pattern is well-established. Each matcher is a function added to `createMatchers()` in the test harness JS string.

### Implementation Notes

**Async matcher registration (critical):** The `createAsyncMatchers` function maintains a hardcoded `builtinNames` array. All four new matcher names (`toStrictEqual`, `toBeNaN`, `toHaveBeenNthCalledWith`, `toSatisfy`) **must** be added to this array. Without this, `.resolves.toStrictEqual(...)` and `.rejects.toSatisfy(...)` will be `undefined` at runtime.

**`strictDeepEqual` — separate function, not extending `deepEqual`:**

The existing `deepEqual` cannot be reused for strict equality because:
1. No constructor check — different classes with same shape pass
2. `.every()` skips sparse array holes — `[1,,3]` equals `[1,undefined,3]`
3. `Object.keys()` already distinguishes undefined-vs-missing by key count, but `strictDeepEqual` should be explicit about this via `Object.hasOwn()`

Implementation sketch:

```js
function strictDeepEqual(a, b, seen) {
  // Asymmetric matcher delegation (same as deepEqual)
  if (b != null && typeof b === 'object' && b[ASYMMETRIC_BRAND]) return b.match(a);
  if (a != null && typeof a === 'object' && a[ASYMMETRIC_BRAND]) return a.match(b);
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  // Constructor identity check
  if (a.constructor !== b.constructor) return false;

  // Circular reference protection
  if (!seen) seen = new WeakSet();
  if (seen.has(a)) return false;
  seen.add(a);

  // Date/RegExp/Map/Set — same as deepEqual
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  // ... Map/Set handling same as deepEqual but recurse with strictDeepEqual ...

  // Arrays — detect sparse holes via Object.hasOwn
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const aHas = Object.hasOwn(a, i);
      const bHas = Object.hasOwn(b, i);
      if (aHas !== bHas) return false;  // hole vs undefined
      if (aHas && !strictDeepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  // Objects — symmetric key check with hasOwn
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => Object.hasOwn(b, k) && strictDeepEqual(a[k], b[k], seen));
}
```

**Input validation before `assert()`:** For `toHaveBeenNthCalledWith` (n must be positive integer) and `toSatisfy` (predicate must be a function), validation errors must `throw` before calling `assert()` so that `.not` negation does not suppress them. This follows the existing pattern used by mock matchers (e.g., `toHaveBeenCalled` checks `MOCK_BRAND` before `assert`).

## Type Flow Map

Not applicable — the matchers are implemented as JavaScript functions in a Rust string literal (`TEST_HARNESS_JS`). There are no TypeScript generics involved. The JS functions are dynamically typed and follow the same pattern as all existing matchers.

## E2E Acceptance Test

From the developer's perspective, these matchers should work identically to vitest:

```ts
// File: src/__tests__/matchers.test.ts
import { describe, it, expect, vi } from 'vitest'; // or vtz test runner

describe('toStrictEqual', () => {
  it('checks constructor identity', () => {
    class Foo { constructor(public x: number) {} }
    class Bar { constructor(public x: number) {} }
    expect(new Foo(1)).toStrictEqual(new Foo(1));
    expect(new Foo(1)).not.toStrictEqual(new Bar(1));
  });

  it('distinguishes undefined from missing', () => {
    expect({ a: 1, b: undefined }).not.toStrictEqual({ a: 1 });
  });

  it('distinguishes sparse array holes from undefined', () => {
    expect([1, , 3]).not.toStrictEqual([1, undefined, 3]);
  });
});

describe('toBeNaN', () => {
  it('passes for NaN', () => {
    expect(NaN).toBeNaN();
    expect(42).not.toBeNaN();
  });
});

describe('toHaveBeenNthCalledWith', () => {
  it('checks nth call args', () => {
    const fn = vi.fn();
    fn('a');
    fn('b', 2);
    expect(fn).toHaveBeenNthCalledWith(1, 'a');
    expect(fn).toHaveBeenNthCalledWith(2, 'b', 2);
  });
});

describe('toSatisfy', () => {
  it('runs custom predicate', () => {
    expect(5).toSatisfy((n: number) => n > 0);
    expect(-1).not.toSatisfy((n: number) => n > 0);
  });
});
```
