# @vertz/compiler

> **Internal package** — You don't use this directly. It powers `vertz build`, `vertz dev`, and `vertz codegen` behind the scenes.

Static analysis and code generation for Vertz applications. Analyzes TypeScript source code to extract application structure (routes, schemas, modules, middleware), validates conventions, and generates runtime artifacts like boot files, route tables, and OpenAPI specs.

## Who uses this

- **`@vertz/cli`** — All CLI commands (`vertz build`, `vertz dev`, `vertz check`) invoke the compiler.
- **`@vertz/codegen`** — Consumes the compiler's intermediate representation (IR) to generate SDKs and CLIs.
- **Framework contributors** — See [INTERNALS.md](./INTERNALS.md) for architecture, pipeline stages, and extension points.

## Related Packages

- [`@vertz/cli`](../cli) — The CLI that invokes the compiler
- [`@vertz/codegen`](../codegen) — Code generation from compiler IR

## License

MIT
