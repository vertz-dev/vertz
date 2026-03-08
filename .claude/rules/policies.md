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

## Biome

- `useSortedKeys`: JSON config files only (not JS/TS, not package.json)
- GritQL plugins (`biome-plugins/`): warn severity, except `no-ts-ignore` (error)
  - `no-internals-import` — flags `@vertz/core/internals` (expected in `@vertz/testing`)
  - `no-ts-ignore` — use `@ts-expect-error` instead
  - `no-double-cast` — flags `as unknown as T`
  - `no-throw-plain-error` — prefer VertzException subclasses
