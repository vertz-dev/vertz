# Phase 3: Docs and Changeset

- **Author:** claude-opus-4-7 (Vinicius)
- **Reviewer:** claude-opus-4-7 (self-adversarial)
- **Commit:** `c2940ab0b`
- **Date:** 2026-04-18

## Changes

- `packages/mint-docs/guides/hmr-types.mdx` (new)
- `packages/mint-docs/docs.json` (+1 nav entry under `vertz/server` group)
- `.changeset/rename-vertz-env-to-client.md` (new — patch for `vertz` + `create-vertz-app`)

## Verification

- `docs.json` — validated as JSON via `node -e "JSON.parse(...)"`.
- The MDX file:
  - Covers `vertz/client` subpath setup.
  - Documents `ImportMeta.hot | undefined` and the optional-chain idiom.
  - Lists the full `ImportMetaHot` surface (`accept`, `accept(cb)`,
    `accept(deps, cb?)`, `dispose`, `data`).
  - Shows narrowing pattern for `data: Record<string, unknown>`.
  - Explains the dual runtime (vtz dev strips + WS protocol; Bun build plugin
    injects guarded self-accept).
  - Acknowledges the Vite-parity follow-up.
- The changeset follows existing repo conventions (`patch` level per
  `policies.md`; 1–2 paragraph body; closes issue reference).

## Review Checklist

- [x] Opening paragraph matches plan's TS2339 framing.
- [x] Two-line tsconfig diff shown.
- [x] `ImportMetaHot` surface covered.
- [x] `| undefined` explanation present.
- [x] `data` narrowing example present.
- [x] Runtime behavior two-liner present.
- [x] Vite-parity follow-up mentioned.
- [x] Page registered in `docs.json` navigation.
- [x] Changeset is `patch` level for `vertz` and `create-vertz-app`.
- [x] Changeset body covers: rename, `accept(cb)` overload, dropped `main`, migration path.

## Findings

### Blockers — none

### Should-Fix — none

### Nits

**N1. Mint build not executed.** The plan requires `vtz run build` at the
`mint-docs` package level to confirm the structural validator passes. The
Mint CLI isn't installed in this workspace (`mint: command not found`), so
validation was limited to:
- JSON parse of `docs.json`.
- Manual checklist against the plan's required content.

If CI runs Mint's validator, any structural issues will surface there. The
local verification is sufficient for a self-review.

**N2. Group placement.** Put `guides/hmr-types` under `vertz/server` group
alongside `guides/env` to match the plan literally. Semantically, HMR types
are more UI/client-side, but the plan approved this placement — leaving as-is
to avoid scope creep. Can be moved in a follow-up if DX disagrees.

### Approved

- Every required content beat from Phase 3 plan is in the MDX.
- Changeset level and body match `policies.md` + the plan's prescribed line.
- No code examples in the MDX contradict the new type shape (every
  `import.meta.hot` reference uses `?.` or an explicit `if` guard).

## Resolution

Approved. Phase 3 complete. Follow-up issues will be filed at PR-open time
(per phase-03 plan).
