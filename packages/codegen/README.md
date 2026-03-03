# @vertz/codegen

> **Internal package** — You don't use this directly. It powers `vertz codegen` behind the scenes.

Generates TypeScript SDKs, CLI clients, and type definitions from your Vertz app's compiled intermediate representation (IR). The generated code is fully type-safe — input/output types, schema types, and streaming event types are all preserved.

## Who uses this

- **`@vertz/cli`** — The `vertz codegen` command invokes this package.
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

- [`@vertz/compiler`](../compiler) — Produces the IR that codegen consumes
- [`@vertz/cli`](../cli) — Provides the `vertz codegen` command
- [`@vertz/cli-runtime`](../cli-runtime) — Runtime for generated CLIs

## License

MIT
