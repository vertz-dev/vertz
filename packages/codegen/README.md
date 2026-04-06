# @vertz/codegen

> **Internal package** — You don't use this directly. It powers `vtz codegen` behind the scenes.

Generates TypeScript SDKs, CLI clients, and type definitions from your Vertz app's compiled intermediate representation (IR). The generated code is fully type-safe — input/output types, schema types, and streaming event types are all preserved.

## Looking to build a Vertz app?

Use the `vtz` CLI — codegen runs automatically:

```bash
npx create-vertz my-app
cd my-app
vtz dev
```

See the [Vertz documentation](https://vertz.dev) for getting started.

## Who uses this

- **`@vertz/cli`** — The `vtz codegen` command invokes this package.
- **Framework contributors** — See [INTERNALS.md](./INTERNALS.md) for generator architecture, custom generators, and the IR adapter.

## How it fits in

```
Your Vertz app (*.ts)
       ↓
@vertz/compiler → AppIR (intermediate representation)
       ↓
@vertz/codegen → Generated SDK, CLI, types
       ↓
.vertz/generated/
```

## Related Packages

- [`@vertz/cli`](https://www.npmjs.com/package/@vertz/cli) — Provides the `vtz codegen` command
- [`create-vertz`](https://www.npmjs.com/package/create-vertz) — Scaffold a new Vertz project
- [`@vertz/compiler`](https://www.npmjs.com/package/@vertz/compiler) — Produces the IR that codegen consumes
- [`@vertz/cli-runtime`](https://www.npmjs.com/package/@vertz/cli-runtime) — Runtime for generated CLIs

## License

MIT
