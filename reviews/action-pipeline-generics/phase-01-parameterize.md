# Phase 1: Parameterize createActionHandler

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Date:** 2026-03-11

## Changes

- packages/server/src/entity/action-pipeline.ts (modified)
- packages/server/src/entity/__tests__/action-pipeline.test-d.ts (new)

## CI Status

- [x] typecheck passed (build + typecheck tsconfigs)
- [x] runtime tests passed (8/8)
- [x] lint clean

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (type-level tests for all changed behavior)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API matches design doc

## Findings

### Approved

- `createActionHandler<TModel>` correctly threads model generic through `def`, `ctx`, and `row`
- `db` stays unparameterized with documented rationale (ModelDef/ModelEntry structural incompatibility at call site)
- After hook type erasure at invocation site explicitly documented as non-goal
- Backward compatibility verified: unparameterized usage compiles cleanly
- Negative type test verifies context mismatch is caught
- `ModelDef`/`ModelEntry` structural compatibility tested
- No regression in route-generator.ts (verified via typecheck)

## Resolution

No changes needed.
