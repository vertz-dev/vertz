# Development Workflow

## Autonomous Development Loop

When assigned a feature with an implementation plan:
- Execute ALL phases sequentially without waiting for user input
- Each phase: implement → CI → self-review → fix → CI → next phase
- Only stop after ALL phases complete and PR is opened to main
- If blocked (ambiguous requirement, design conflict), ask the user — otherwise keep going

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

1. Push feature branch to origin
2. Open PR to main with:
   - Public API Changes summary (breaking / deferred / additions vs design doc)
   - Summary of all phases
   - E2E acceptance test status
3. **STOP** — wait for human review and approval

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
