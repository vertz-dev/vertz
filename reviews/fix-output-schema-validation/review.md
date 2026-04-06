# Review: fix(agents): output schema validation error (#2354)

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** b5a2148f5..df1d37bcc
- **Date:** 2026-04-06

## Changes

- packages/agents/src/workflow.ts (modified -- output validation returns error instead of silent fallback)
- packages/agents/src/workflow.test.ts (modified -- 2 new tests, strengthened assertions, removed stale output schemas)
- .changeset/fix-output-schema-validation.md (new)

## CI Status

- [x] Quality gates passed (183 tests, typecheck clean, lint 0 errors)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (failing tests first, then fix)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved after fixes

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Should-fix | No error reason in WorkflowResult for debugging | Created #2358 as follow-up |
| 2 | Should-fix | `parse()` can throw on custom refinements; removed safety net | Fixed: wrapped in try/catch |
| 3 | Should-fix | Test assertions too weak -- don't verify agent completed | Fixed: added step status/response assertions |
| 4 | Nit | No explicit test for no-output-schema prev shape | Fixed: added assertion |

## Resolution

All findings addressed. F2 fixed by wrapping schema parse in try/catch. F3 fixed by adding detailed assertions. F1 tracked in #2358. F4 fixed inline.
