# Definition of Done

Clear criteria for when work is considered complete at every level.

## Phase Done

A phase (one milestone in an implementation plan) is done when:

- [ ] All TDD cycles complete — every behavior has a failing test that was made to pass
- [ ] Integration tests for the phase are passing — as defined in the phase's acceptance criteria
- [ ] Type flow verification — every generic type parameter introduced in this phase has a `.test-d.ts` test proving it flows from definition to consumer. No dead generics. (See `tdd.md` → Type Flow Verification)
- [ ] Quality gates passing — lint, format, typecheck all clean
- [ ] PR reviewed and approved by a different engineer
- [ ] GitHub issue updated to done

## Feature Done

A feature (all phases of a design) is done when:

- [ ] All phase PRs merged to the feature branch
- [ ] E2E acceptance test passing — the test defined in the design doc at design time
- [ ] CI green — all tests, lint, typecheck across the monorepo
- [ ] Design doc updated — if any deviations occurred during implementation, the design doc reflects the final state
- [ ] Changeset added — with appropriate semver bump
- [ ] Retrospective written — `plans/post-implementation-reviews/<feature>.md`
- [ ] All GitHub issues marked done
- [ ] Human approval — an org admin approves the feature branch to main PR

## Bug Fix Done

### Tier 1 — Internal (no public API impact)

- [ ] GitHub issue exists
- [ ] Failing test reproduces the bug
- [ ] Fix makes the test pass
- [ ] Quality gates passing
- [ ] PR reviewed and approved by one engineer
- [ ] Changeset added

### Tier 2 — Public API change or breaking change

- [ ] GitHub issue exists
- [ ] Approach validated by tech lead before implementation begins
- [ ] Failing test reproduces the bug
- [ ] Fix makes the test pass
- [ ] Quality gates passing
- [ ] PR reviewed and approved by one engineer
- [ ] If public API surface changed — advocate reviews the DX impact
- [ ] If deadlines or external consumption affected — PM re-approves
- [ ] Human approval required
- [ ] Changeset added (minor or major version bump as appropriate)

## Small Improvement Done

Refactors, DX tweaks, internal cleanup, performance improvements that don't change public API.

- [ ] GitHub issue exists
- [ ] TDD if there's behavior involved
- [ ] Quality gates passing
- [ ] PR reviewed and approved by one engineer
- [ ] If it touches multiple packages — tech lead reviews the approach before coding starts
- [ ] Changeset added if it affects published packages

## Retrospective

Required after every feature completion. Lives in `plans/post-implementation-reviews/`.

Must include:

- **What went well** — things that worked, good decisions, smooth phases
- **What went wrong** — design deviations, missed unknowns, blockers encountered
- **How to avoid it** — concrete, actionable changes to process or tooling. Not "be more careful" — specific steps like "add X check to design review checklist" or "require POC for Y type of unknown"
- **Process changes adopted** — if the retrospective leads to a rule change, state it explicitly

## Design Deviation

If during implementation an engineer discovers the design needs to change, this is a red flag — it means the design phase missed something.

When this happens:

1. Engineer stops and escalates to tech lead
2. Tech lead re-evaluates and updates the design doc
3. **Re-approval rules:**
   - Public API or developer-facing surface changed → advocate must re-approve
   - Deadlines or external consumption affected → PM must re-approve
   - Internal-only changes (architecture, implementation details) → tech lead's call

What is NOT a design deviation:
- Refactoring internals while keeping the same public API
- Implementation details the design intentionally left open
- Performance optimizations that don't change behavior
