# @vertz/test

Type declarations and runtime stubs for the Vertz test framework.

## How it works

`@vertz/test` is a **synthetic module** — like `node:fs` in Node.js. When you run tests with `vtz test`, the runtime intercepts `@vertz/test` imports and provides the real test framework. This package exists so that:

- **npm/bun can resolve the import** (no 404 on install)
- **TypeScript/IDEs provide type checking and autocomplete**
- **Accidental use outside `vtz test`** gives a clear error

## Installation

```bash
vtz add -d @vertz/test
```

> You only need this package for TypeScript resolution. The runtime provides the real implementation automatically.

## Usage

```ts
import { describe, expect, it } from '@vertz/test';

describe('add', () => {
  it('adds two numbers', () => {
    expect(1 + 2).toBe(3);
  });
});
```

Run with:

```bash
vtz test
```

## Available exports

### Test structure

`describe`, `it`, `test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`

### Assertions

`expect(value)` with 30+ matchers: `toBe`, `toEqual`, `toThrow`, `toContain`, `toMatchObject`, `toHaveBeenCalledWith`, and more.

### Mocking

`mock()`, `spyOn()`, `vi` (Vitest-compatible namespace with `fn()`, `spyOn()`, timer methods)

### Type testing

`expectTypeOf()` for compile-time type assertions in `.test-d.ts` files.

## Migrating from bun:test

```bash
vtz migrate-tests
```

This rewrites `'bun:test'` imports to `'@vertz/test'` and converts `vi.fn()`/`vi.spyOn()` to `mock()`/`spyOn()`.

## Documentation

Full test runner documentation: [vertz.dev/guides/testing-unit](https://vertz.dev/guides/testing-unit)

## License

MIT
