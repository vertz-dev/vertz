---
'@vertz/runtime': patch
---

feat(vtz): add vitest-compatible mock APIs to `@vertz/test`

Real-world test suites written against vitest often call `getMockImplementation()`,
`getMockName()`, `mockName()`, and `withImplementation()` on mock functions. Our
runtime exposed `mock()` / `vi.fn()` without those methods, so tests migrated
from vitest hit `TypeError: x.getMockImplementation is not a function` (surfaced
in #2731).

This PR fills the gap. Added to every mock created by `mock()`, `vi.fn()`, and
`spyOn()`:

- **`getMockImplementation()`** — returns the current default implementation, or
  `undefined` if none is set. Does not consider the once-queue (matches vitest).
- **`getMockName()`** — returns the display name set via `mockName()`. Defaults
  to `''` (empty string).
- **`mockName(name)`** — sets the display name for diagnostics. Returns the mock
  for chaining. Cleared by `mockReset()`; preserved by `mockClear()`.
- **`withImplementation(fn, cb)`** — temporarily swaps the default implementation
  with `fn`, runs `cb`, then restores the original — awaiting `cb` if it returns
  a Promise. Returns `cb`'s result. Restores cleanly on both sync and async
  exceptions. Does not disturb `getMockImplementation()` after return.

Also added type declarations for all four methods to `MockFunction` in
`@vertz/test`, and added Rust + TS test coverage (10 Rust tests, 15 TS tests).

Not implemented (intentionally): `mockThrow` / `mockThrowOnce` (v4.1.0+ vitest,
would add surface without strong use-case), `mock.settledResults` /
`mock.instances` / `mock.contexts` / `mock.invocationCallOrder` (separate state
that the runtime doesn't currently track — follow-up if demand materializes).
