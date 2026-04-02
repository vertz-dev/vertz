# Vertz Framework

**Read [VISION.md](./VISION.md) and [MANIFESTO.md](./MANIFESTO.md) before making any design decision.** Every API, architecture choice, and implementation approach must align with the 8 principles in the vision.

## Stack

### TypeScript (packages/)
- Runtime: Bun
- Language: TypeScript (strict mode)
- Linter: oxlint
- Formatter: oxfmt
- Test runner: `bun test`
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
bun run build        # Build all packages
bun test             # Run tests
bun run typecheck    # TypeScript strict checking
bun run lint         # oxlint check
bun run lint:fix     # Auto-fix lint issues
bun run format       # oxfmt format check
bun run format:fix   # Auto-fix formatting
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
bun test && bun run typecheck && bun run lint
```

### Rust
```bash
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```
