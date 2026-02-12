# Semver Policy

## Pre-v1: Patch Only

All packages in vertz are pre-v1 (0.x.y). While under v1, **every changeset must use `patch`** — never `minor` or `major`.

This applies to all change types: bug fixes, new features, optimizations, DX improvements, and even breaking changes. Pre-v1 semver does not carry the same stability guarantees as post-v1, so we ship everything as patches to move fast without inflating version numbers.

## When to use minor or major

Only when the user explicitly says so. Do not infer a minor or major bump from the nature of the change. If you think a change warrants a minor or major bump, ask — don't assume.

## Changesets

When creating changeset files (`.changeset/*.md`), always use `patch`:

```markdown
---
'@vertz/ui': patch
---

Description of the change.
```

## Version references in tickets and docs

When referencing future work, use the current patch series (e.g., `v0.1.x`) — never reference a hypothetical next minor (e.g., `v0.2`). All planned work ships as patches until explicitly told otherwise.
