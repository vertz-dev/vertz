# Vertz Framework

## What is Vertz?

Vertz is a full-stack TypeScript framework. It includes:

- **Database ORM** (`@vertz/db`) — typed queries, migrations, PostgreSQL + SQLite + D1
- **API server** (`@vertz/server`) — entities, services, REST endpoints, auto-generated OpenAPI
- **Compiled UI** (`@vertz/ui`) — signals, JSX, router, SSR, forms, scoped CSS
- **AI agents** (`@vertz/agents`) — agents, typed tools, workflows on Cloudflare Workers
- **Custom runtime & CLI** (`vtz`) — Rust-powered dev server, build, test runner

One schema definition (`d.table()`) drives the database, API types, client SDK, and UI — if it builds, it works.

**Read [VISION.md](./VISION.md) and [MANIFESTO.md](./MANIFESTO.md) before making any design decision.** Every API, architecture choice, and implementation approach must align with the 8 principles in the vision.

## Stack

### TypeScript (packages/)
- Runtime: Bun
- Language: TypeScript (strict mode)
- Linter: oxlint
- Formatter: oxfmt
- Test runner: `vtz test`
- Monorepo: Bun workspaces under `packages/`

### Rust (native/)
- Language: Rust (2021 edition)
- Linter: clippy
- Formatter: rustfmt
- Test runner: `cargo test`
- Async runtime: Tokio
- JS engine: V8 via deno_core
- HTTP server: axum
- Cargo workspace under `native/`

## Development

### TypeScript

```bash
vtz run build        # Build all packages
vtz test             # Run tests
vtz run typecheck    # TypeScript strict checking
vtz run lint         # oxlint check
vtz run lint:fix     # Auto-fix lint issues
vtz run format       # oxfmt format check
vtz run format:fix   # Auto-fix formatting
```

### Rust

```bash
cd native
cargo test --all           # Run all tests
cargo clippy --all-targets --release -- -D warnings  # Lint
cargo fmt --all -- --check # Format check
cargo fmt --all            # Auto-format
cargo build --release      # Release build
```

## Crate Structure

- **vtz** (`native/vtz/`) — Full runtime: V8 dev server, test runner, package manager
- **vertz-compiler-core** (`native/vertz-compiler-core/`) — Rust compilation library (transforms, JSX, CSS)
- **vertz-compiler** (`native/vertz-compiler/`) — NAPI bindings for the framework's Bun plugin

## Git

- **NEVER commit or push directly to `main`.** Always create a branch and open a PR.
- See `.claude/rules/workflow.md` for branch naming, commits, and PR requirements.

## Conventions

- Strict TDD: Red → Green → Refactor. Every behavior needs a failing test first.
- Run quality gates (lint, format, typecheck) after every green.
- No `@ts-ignore` — use `@ts-expect-error` with a description.
- No `as any` — maintain full type safety.
- Single quotes, semicolons, trailing commas, 2-space indent, 100 char line width.
- No `unsafe` without a `// SAFETY:` comment explaining the invariant.
- No `#[allow(clippy::*)]` without a comment explaining why.
- Prefer `thiserror` for Rust error types.
- See `CONTRIBUTING.md` and `.claude/rules/` for detailed guidelines.

## Quality Gates (must all pass before push)

### TypeScript
```bash
vtz test && vtz run typecheck && vtz run lint
```

### Rust
```bash
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```
