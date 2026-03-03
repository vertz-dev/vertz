# @vertz/ui-compiler

> **Internal package** — You don't use this directly. It powers the reactive compiler behind `@vertz/ui`.

The UI compiler transforms `@vertz/ui` components at build time — converting `let` declarations into signals, wrapping derived `const` values in `computed()`, inserting `.value` accessors, and generating getter-based props for cross-component reactivity.

## Who uses this

- **`@vertz/ui-server`** — The Bun plugin loads this compiler to transform `.tsx` files during development and SSR.
- **Framework contributors** — If you're working on the compiler itself, see the source in `src/` for architecture details.

## Related Packages

- [`@vertz/ui`](../ui) — The UI framework this compiler targets
- [`@vertz/ui-server`](../ui-server) — Dev server and SSR runtime that invokes the compiler

## License

MIT
