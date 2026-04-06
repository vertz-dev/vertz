# Phase 1: Builder Pattern for Typed ctx.prev

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** 40346b830..HEAD
- **Date:** 2026-04-06

## Changes

- packages/agents/src/workflow.ts (modified — WorkflowBuilder class, updated types)
- packages/agents/src/workflow.test.ts (modified — migrated to builder API, added validated output test)
- packages/agents/src/types.test-d.ts (modified — builder type tests)
- packages/agents/src/index.ts (modified — updated exports)
- plans/2147-agents-typed-prev.md (new)
- plans/2147-agents-typed-prev/phase-01-builder-pattern.md (new)

## CI Status

- [x] Quality gates passed (181 tests, typecheck clean, lint 0 errors)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (type tests RED → GREEN, runtime tests migrated)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved after fixes

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | Agent step with approval: second overload allowed `approval` on agent steps, creating type-runtime mismatch | Fixed: removed `approval` from agent step overload |
| 2 | Should-fix | StepDefinition.input loses generics | Fixed: added comment explaining intentional erasure |
| 3 | Nit | `output: config.output ?? undefined` redundant | Fixed: removed `?? undefined` |
| 4 | Nit | `as any` cast comment too terse | Fixed: improved comment |
| 5 | Should-fix | Missing runtime test for validated output in prev | Fixed: added test |
| 6 | Should-fix | Output schema validation silently falls back (pre-existing) | Created issue #2354 |

## Resolution

All findings addressed. Blocker (F1) fixed by removing approval from agent step overload. Should-fix (F5) fixed by adding validated-output test. Pre-existing bug (F6) tracked in #2354.
