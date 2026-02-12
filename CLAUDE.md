# Vertz Framework

**Read [VISION.md](./VISION.md) and [MANIFESTO.md](./MANIFESTO.md) before making any design decision.** Every API, architecture choice, and implementation approach must align with the 8 principles in the vision.

## Stack

- Runtime: Bun
- Language: TypeScript (strict mode)
- Linter/Formatter: Biome
- Test runner: `bun test`
- Monorepo: Bun workspaces under `packages/`

## Development

```bash
bun run build        # Build all packages
bun test             # Run tests
bun run typecheck    # TypeScript strict checking
bun run lint         # Biome lint check
bun run lint:fix     # Auto-fix lint issues
bun run format:fix   # Auto-fix formatting
```

## Git

- **NEVER commit or push directly to `main`.** Always create a branch and open a PR.
- All commits use bot identities via `git-as.sh` — never personal accounts.
- See `.claude/rules/pr-policies.md` for branch naming and PR requirements.

## Conventions

- Strict TDD: Red → Green → Refactor. Every behavior needs a failing test first.
- Run quality gates (lint, format, typecheck) after every green.
- No `@ts-ignore` — use `@ts-expect-error` with a description.
- No `as any` — maintain full type safety.
- Single quotes, semicolons, trailing commas, 2-space indent, 100 char line width.
- See `CONTRIBUTING.md` and `.claude/rules/` for detailed guidelines.
