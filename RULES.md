# Engineering Rules — Condensed Playbook

> This is the mandatory rules summary for all vertz team agents. Full rules live in
> `/workspace/backstage/.claude/rules/` and `/workspace/vertz/.claude/rules/`.
> When in doubt, read the full rule file.

## TDD — No Exceptions

**Red → Green → Refactor. One test at a time.**

1. Write ONE failing test
2. Write MINIMAL code to pass it
3. **Green = tests + typecheck + lint ALL pass** — not just tests
4. Refactor while staying green
5. Repeat

**Never:**
- Commit implementation without tests
- Write multiple tests before implementing
- Use `@ts-ignore`, `as any`, `.skip`, `--no-verify`
- Skip quality gates for any reason

**Recovery:** If you find uncommitted code without tests, write tests FIRST. Do not commit untested code.

**Type-level TDD:** Use `@ts-expect-error` for negative type tests. Every generic must be tested end-to-end.

Full rules: `/workspace/vertz/.claude/rules/tdd.md`, `/workspace/backstage/.claude/rules/tdd-enforcement.md`

## Git & PR Policies

- **Never push to `main`** — all changes go through PRs
- **Never merge PRs to `main`** — requires human (CTO) approval
- **Never commit without a ticket**
- **Never review your own PR** — reviews must come from a different bot
- **Use bot scripts only:** `bots/git-as.sh $AGENT_BOT` and `bots/gh-as.sh $AGENT_BOT`
- **One feature branch per design** — phase PRs target the feature branch
- **Changeset required** for any package change

Full rules: `/workspace/backstage/.claude/rules/pr-policies.md`

## Quality Gates (run before every push)

```bash
bun run test          # all tests pass
bun run typecheck     # zero type errors
bun run lint          # biome clean
```

All three must pass. A push with failing gates is a process violation.

## Development Lifecycle

| Stage | Owner | What |
|-------|-------|------|
| 0: Planning | pm + mike | PRD in `backstage/plans/prds/` |
| 1: Design | mike | Design doc in `vertz/plans/` — needs josh (DX) + pm (product) + engineer approval |
| 2: Plan | mike + pm | Implementation plan + tickets |
| 3: Execute | Engineer | TDD, phase PRs, quality gates |

**After merge:** josh builds demo + DX journal, writes build-in-public content.

Full rules: `/workspace/backstage/.claude/rules/dev-lifecycle.md`

## Bug Fix Process

- **Tier 1 (Critical):** Fix immediately, no design doc needed. Direct PR to main.
- **Tier 2 (Important):** Ticket + PR, one reviewer.
- **Tier 3 (Minor):** Batch into next milestone.

All tiers require tests. Full rules: `/workspace/backstage/.claude/rules/bug-process.md`

## Bot Identity

- Check `AGENT_BOT` env var to know who you are
- Read `/workspace/backstage/team.json` for your role and ownership
- Stay in your lane — don't modify packages you don't own without coordinating
- All git/GitHub ops through bot scripts — never use personal credentials

Full rules: `/workspace/backstage/.claude/rules/bot-roles.md`

## Design Docs

Required sections: API surface, manifesto alignment, non-goals, unknowns, E2E acceptance test.

If implementation needs to diverge from design: **stop and escalate to mike or ben.**

Full rules: `/workspace/vertz/.claude/rules/design-docs.md`

## Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Scope by package: `feat(db):`, `fix(ui-compiler):`
- Keep commits atomic — one logical change per commit

Full rules: `/workspace/vertz/.claude/rules/commits.md`

## Definition of Done

A ticket is done when:
- [ ] All acceptance criteria met
- [ ] Tests written (TDD)
- [ ] Quality gates pass (test + typecheck + lint)
- [ ] PR reviewed by different bot
- [ ] Ticket status updated

Full rules: `/workspace/vertz/.claude/rules/definition-of-done.md`

## Secret Management

- **Never hardcode secrets** — all credentials come from Doppler via env vars
- **Never log or print secrets**
- **Never commit `.env` files**

Full rules: `/workspace/backstage/.claude/rules/secret-management.md`
