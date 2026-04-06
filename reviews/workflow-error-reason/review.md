# Review: feat(agents): add errorReason to WorkflowResult (#2358)

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** 807e71fe5..fd31b873a
- **Date:** 2026-04-06

## Changes

- packages/agents/src/workflow.ts (modified -- added WorkflowErrorReason type, populated in 3 error paths)
- packages/agents/src/workflow.test.ts (modified -- 4 errorReason assertions + 1 new test for parse() throwing)
- packages/agents/src/index.ts (modified -- export WorkflowErrorReason)
- packages/mint-docs/guides/agents/workflows.mdx (modified -- builder pattern API, errorReason docs)
- .changeset/workflow-error-reason.md (new)

## CI Status

- [x] Quality gates passed (184 tests, typecheck clean)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes documented

## Findings

### Approved after fixes

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Should-fix | JSDoc missing: input validation throws, not represented as error reason | Fixed: added JSDoc |
| 2 | Should-fix | No test for catch branch where parse() throws | Fixed: added test with throwing schema mock |
| 3 | Should-fix | Docs not updated with errorReason and builder pattern | Fixed: updated workflows.mdx |
| 4 | Nit | WorkflowResult not a discriminated union (pre-existing) | Acknowledged, not in scope |

## Resolution

All findings addressed. Docs updated to builder pattern API and errorReason field.
