# Design & Planning

## Design Doc (required sections)

Every feature needs a design doc in `plans/` before implementation:

1. **API Surface** — concrete TypeScript examples (must compile)
2. **Manifesto Alignment** — which principles, what tradeoffs, what was rejected
3. **Non-Goals** — what this deliberately won't do
4. **Unknowns** — "none identified" or list with resolution (discussion / needs POC)
5. **POC Results** — question, what was tried, what was learned, link to closed POC PR
6. **Type Flow Map** — trace every generic from definition to consumer. No dead generics.
7. **E2E Acceptance Test** — concrete input/output, from developer perspective, includes @ts-expect-error for invalid usage

## Design Approval

Three sign-offs required before implementation:
- **DX** (josh) — Is the API intuitive? Will developers love it?
- **Product/scope** — Does it fit the roadmap? Right scope?
- **Technical** — Can it be built as designed? Hidden complexity?

## Implementation Plans

- **Vertical slices** — each phase usable end-to-end (not "internals first, integrate later")
- **First slice** = thinnest possible E2E developer experience
- Each phase lists: concrete integration tests as acceptance criteria
- Dependencies between phases explicitly marked
- Developer walkthrough per feature

## Integration Tests

- Must use public package imports (`@vertz/server`, `@vertz/db`) — never relative
- Walkthrough test written in Phase 1 as failing test (RED state)
- Cross-package typecheck mandatory before merge: `bun run typecheck --filter @vertz/integration-tests`
- Types in public signatures → `dependencies` (not `devDependencies`)

## Definition of Done

### Phase
- [ ] TDD cycles complete — every behavior has failing test made to pass
- [ ] Phase integration tests passing
- [ ] Type flow verified (`.test-d.ts` for every generic)
- [ ] Quality gates clean (test + typecheck + lint)
- [ ] Adversarial reviews written in `reviews/<feature>/`

### Feature
- [ ] All phases done
- [ ] E2E acceptance test passing
- [ ] Developer walkthrough passing (public imports only)
- [ ] Cross-package typecheck passing
- [ ] Design doc updated if deviations occurred
- [ ] Changeset added
- [ ] Retrospective written
- [ ] Human approves PR to main

### Bug Fix
- **Tier 1** (internal): issue exists → failing test → fix → quality gates → review → changeset
- **Tier 2** (public API): + tech lead validates approach first + human approval

### Design Deviation
- Stop, escalate to tech lead
- Public API changed → DX re-approves
- Deadlines affected → PM re-approves
- Internal only → tech lead's call

### Retrospective (mandatory after every feature)
Location: `plans/post-implementation-reviews/<feature>.md`
- What went well
- What went wrong
- How to avoid it (concrete actions, not "be more careful")
- Process changes adopted
