# @vertz/compiler

> **Internal package** — You don't use this directly. It powers `vtz build`, `vtz dev`, and `vtz codegen` behind the scenes.

Static analysis and code generation for Vertz applications. Analyzes TypeScript source code to extract application structure (routes, schemas, modules, middleware), validates conventions, and generates runtime artifacts like boot files, route tables, and OpenAPI specs.

## Looking to build a Vertz app?

Use the `vtz` CLI — the compiler runs automatically:

```bash
npx create-vertz my-app
cd my-app
vtz dev
```

See the [Vertz documentation](https://vertz.dev) for getting started.

## Who uses this

- **`@vertz/cli`** — All CLI commands (`vtz build`, `vtz dev`, `vtz check`) invoke the compiler.
- **`@vertz/codegen`** — Consumes the compiler's intermediate representation (IR) to generate SDKs and CLIs.
- **Framework contributors** — See [INTERNALS.md](./INTERNALS.md) for architecture, pipeline stages, and extension points.

## Related Packages

- [`@vertz/cli`](https://www.npmjs.com/package/@vertz/cli) — The CLI that invokes the compiler
- [`create-vertz`](https://www.npmjs.com/package/create-vertz) — Scaffold a new Vertz project
- [`@vertz/codegen`](https://www.npmjs.com/package/@vertz/codegen) — Code generation from compiler IR

## License

MIT
