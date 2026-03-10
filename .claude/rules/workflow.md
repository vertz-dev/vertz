# Development Workflow

## Autonomous Development Loop

When assigned a feature with an implementation plan:
- Execute ALL phases sequentially without waiting for user input
- Each phase: implement → CI → self-review → fix → CI → next phase
- After all phases: push → open PR → monitor CI → rebase → ensure green → THEN stop
- **The human only sees the final PR, already reviewed and CI-green.** Do not ask for input between phases.
- If blocked (ambiguous requirement, design conflict that agents cannot resolve), ask the user — otherwise keep going

### Phase Execution

For each phase:
1. **Implement** — strict TDD (see tdd.md). One failing test → minimal code → green → refactor
2. **Quality gates** — ALL must pass before review:
   - `bun test` (changed packages)
   - `bun run typecheck` (changed packages)
   - `bunx biome check --write <changed-files>`
3. **Adversarial review** — spawn review agents in parallel:
   - Each relevant agent (see `.claude/agents/`) reviews from their perspective
   - Reviews written to `reviews/<feature>/phase-NN-<slug>.md`
   - Check: delivers what ticket asks, TDD compliance, no type gaps, no security issues, API matches design doc
   - Reviews must be adversarial — actively look for mistakes, don't rubber-stamp
4. **Address findings** — fix issues from all reviews, rerun quality gates
5. **Move to next phase** — no pause, no user prompt needed

### After All Phases

1. Rebase feature branch on latest `main` to ensure it's up-to-date
2. Run full quality gates one final time after rebase (tests, typecheck, lint)
3. Push feature branch to origin
4. Open PR to main with:
   - Public API Changes summary (breaking / deferred / additions vs design doc)
   - Summary of all phases
   - E2E acceptance test status
5. **Monitor GitHub CI** — check PR status using `gh pr checks` or `gh run list`
6. If CI fails on GitHub: diagnose, fix locally, push, and monitor again. Repeat until green.
7. If `main` has advanced since the PR was opened: rebase, re-run quality gates, force-push, monitor CI again.
8. **STOP only when GitHub CI is green and the PR is ready for review** — notify the human that the PR is ready for their review and manual merge.

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<name>` | `feat/codegen` |
| Bug fix | `fix/<name>` | `fix/schema-null` |
| Improvement | `chore/<name>` | `chore/biome-rules` |
| POC | `poc/<name>` | `poc/streaming` |

## Commits

- Format: `<type>(<scope>): <description> [#<ISSUE>]`
- Read the GitHub issue before starting work
- Reference issue in every commit
- If commit closes issue, add `Closes #<ISSUE>` in body
- Never commit or push to main directly

## PR to Main Requirements

- Public API Changes summary (mandatory)
- E2E acceptance test passing
- Cross-package typecheck: `bun run typecheck --filter @vertz/integration-tests`
- All issues marked done
- **Docs updated** — if the PR introduces new APIs, changes existing behavior, or adds features, update `packages/docs/` (Mintlify). New APIs get new pages or sections; changed behavior gets existing pages updated; gotchas get noted.
- Changeset added
- Retrospective in `plans/post-implementation-reviews/`
- Human approval required

## Quality Gates (pre-push)

Before pushing ANY code:
- `bun test` — tests pass
- `bun run typecheck` — types clean
- `bun run lint` — lint clean
- Never push code that fails typecheck

## Parallel Work

- Multiple agents on same repo → each uses separate git worktree
- Never work in main repo directory when other agents may be active
