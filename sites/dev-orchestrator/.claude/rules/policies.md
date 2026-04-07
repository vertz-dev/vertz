# Policies

## Breaking Changes (Pre-v1)

- All packages pre-v1 — no external users
- Breaking changes encouraged — adopt better designs
- No backward-compat shims, no migration guides, no deprecated aliases
- Consolidate aggressively (merge packages, move functions)
- Only pause if it affects active PR / in-progress work

## Semver

- Every changeset = `patch` — never minor/major unless user explicitly says so
- Changesets in `.changeset/*.md` always use `patch`
- Reference future work as `v0.1.x`, never `v0.2`

## Linting (oxlint + oxfmt)

- Linter: oxlint (`.oxlintrc.json`), Formatter: oxfmt (`.oxfmtrc.json`)
- JS plugins (`oxlint-plugins/vertz-rules.js`): warn severity
  - `no-internals-import` — flags `@vertz/core/internals` (expected in `@vertz/testing`)
  - `no-double-cast` — flags `as unknown as T`
  - `no-throw-plain-error` — prefer VertzException subclasses
  - `no-wrong-effect` — use `domEffect()` or `lifecycleEffect()`
  - `no-body-jsx` — no JSX in variable initializers
  - `no-try-catch-result` — no try/catch around error-as-value APIs
- Built-in `typescript/ban-ts-comment` (error) — use `@ts-expect-error` instead of `@ts-ignore`
