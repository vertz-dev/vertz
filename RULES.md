# Engineering Rules — Condensed Playbook

> Mandatory reading for all vertz team agents. Full rules live in
> `/workspace/backstage/.claude/rules/` and `/workspace/vertz/.claude/rules/`.
> When in doubt, read the full rule file.

---

## Quick Reference

```
Branch:    feat/<name>, fix/<name>, chore/<name>
Commit:    type(scope): desc         e.g. feat(db): add health check
TDD:       Red → Green (test+typecheck+lint) → Refactor
Pre-push:  bun run test && bun run typecheck && bun run lint
PR:        Never to main directly. Bot review + CI green.
Done:      All acceptance criteria + tests + gates + review.
Bot git:   /workspace/backstage/bots/git-as.sh $AGENT_BOT <cmd>
Bot gh:    /workspace/backstage/bots/gh-as.sh $AGENT_BOT <cmd>
```

---

## Reading Order by Task Type

**Implementing a feature:**
1. This file (RULES.md)
2. Your ticket in `/workspace/vertz/tickets/`
3. The design doc in `plans/`
4. `/workspace/vertz/.claude/rules/tdd.md`
5. `/workspace/vertz/.claude/rules/commits.md`
6. `/workspace/vertz/.claude/rules/definition-of-done.md`

**Fixing a bug:**
1. This file → ticket → `/workspace/backstage/.claude/rules/bug-process.md`

**Writing a design doc:**
1. This file → PRD → `/workspace/vertz/.claude/rules/design-docs.md`

**Reviewing a PR:**
1. This file → `/workspace/backstage/.claude/rules/pr-policies.md` → `/workspace/backstage/.claude/rules/review-followups.md`

---

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

**Type-level TDD:** Generic type parameters must be tested end-to-end with `.test-d.ts` files.
- **Red:** Write `@ts-expect-error` on code the compiler should reject but doesn't yet
- **Green:** Tighten the type signature so the compiler rejects the call
- Both positive (compiles) and negative (`@ts-expect-error`) type tests required
- Every generic that is defined must have a test proving it reaches the end consumer

**Recovery:** If you find uncommitted code without tests:
1. **Stop** — do not commit as-is
2. **Write tests first** for the existing code
3. Verify tests would fail without the implementation
4. Run quality gates
5. Commit tests first, then implementation

Full rules: `/workspace/vertz/.claude/rules/tdd.md`, `/workspace/backstage/.claude/rules/tdd-enforcement.md`

---

## Git & PR Policies

- **Never push to `main`** — all changes go through PRs
- **Never merge PRs to `main`** — requires human (CTO) approval
- **Never commit without a ticket**
- **Never review your own PR** — reviews must come from a different bot
- **Use bot scripts only:** `bots/git-as.sh $AGENT_BOT` and `bots/gh-as.sh $AGENT_BOT`
- **Branch naming:** `feat/<name>`, `fix/<name>`, `chore/<name>`
- **One feature branch per design** — phase PRs target the feature branch
- **Changeset required** for any package change

Full rules: `/workspace/backstage/.claude/rules/pr-policies.md`

---

## Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Scope by package: `feat(db):`, `fix(ui-compiler):`
- Keep commits atomic — one logical change per commit
- Reference ticket ID when applicable

Full rules: `/workspace/vertz/.claude/rules/commits.md`

---

## Quality Gates (run before every push)

```bash
bun run test          # all tests pass
bun run typecheck     # zero type errors
bun run lint          # biome clean
```

All three must pass. A push with failing gates is a process violation.

---

## Development Lifecycle

| Stage | Owner | What |
|-------|-------|------|
| 0: Planning | pm + mike | PRD in `backstage/plans/prds/` |
| 1: Design | mike | Design doc in `vertz/plans/` — needs josh (DX) + pm (product) + engineer approval |
| 2: Plan | mike + pm | Implementation plan + tickets |
| 3: Execute | Engineer | TDD, phase PRs, quality gates |

**Design deviations:** If implementation needs to diverge from the design doc:
1. **Stop.** Do not silently deviate.
2. **Escalate** to mike (VP Eng) or ben (Tech Lead)
3. Public API changed → josh must re-approve
4. Timeline/scope changed → pm must re-approve
5. Internal-only → mike's call

**After merge:** josh builds demo + DX journal, writes build-in-public content.

Full rules: `/workspace/backstage/.claude/rules/dev-lifecycle.md`

---

## Bug Fix Process

- **Tier 1 (Critical):** Fix immediately, no design doc needed. Direct PR to main.
- **Tier 2 (Important):** Ticket + PR, one reviewer.
- **Tier 3 (Minor):** Batch into next milestone.

All tiers require tests. Full rules: `/workspace/backstage/.claude/rules/bug-process.md`

---

## Definition of Done

A ticket is done when:
- [ ] All acceptance criteria met
- [ ] Tests written (TDD — not retrofitted)
- [ ] Type-level tests for any generics introduced
- [ ] Quality gates pass (test + typecheck + lint)
- [ ] PR reviewed by different bot
- [ ] Ticket status updated
- [ ] No `TODO`, `FIXME`, or placeholder implementations

Full rules: `/workspace/vertz/.claude/rules/definition-of-done.md`

---

## Bot Identity

- Check `AGENT_BOT` env var to know who you are
- Read `/workspace/backstage/team.json` for your role and ownership
- Stay in your lane — don't modify packages you don't own without coordinating
- All git/GitHub ops through bot scripts — never use personal credentials

Full rules: `/workspace/backstage/.claude/rules/bot-roles.md`

---

## Code Standards

### Error Handling
- Use custom error classes extending `Error` with descriptive messages
- Always include context in error messages (what failed, what was expected, what was received)
- Never swallow errors silently — catch, log, and re-throw or handle explicitly

### Documentation
- All public API exports must have JSDoc with `@param`, `@returns`, `@example`
- Non-obvious internal logic must have inline comments explaining *why*, not *what*

### Dependencies
- Minimize external dependencies — prefer Bun built-ins
- New dependencies require tech lead (ben) approval
- Zero runtime dependencies for core packages where possible

### Security
- No `eval()` or `new Function()`
- Sanitize user input in examples and docs
- Document security implications of any API that handles raw HTTP

---

## Secret Management

- **Never hardcode secrets** — all credentials come from Doppler via env vars
- **Never log or print secrets**
- **Never commit `.env` files**

Full rules: `/workspace/backstage/.claude/rules/secret-management.md`

---

## Agent-Specific Rules — Common Mistakes

These are failure modes specific to AI coding agents. Read this every session.

### Don't Do These

1. **Don't batch-write then retrofit tests.** Write ONE test, make it pass, repeat. If you catch yourself writing 100+ lines of implementation before a test, you've broken TDD. Stop and write the test.

2. **Don't hallucinate APIs.** If you're unsure how a function, library, or Bun API works, **read the source code or docs first.** Don't guess at method signatures, parameter types, or return values.

3. **Don't create files without checking if they exist.** Always check the existing file structure before creating new files. Use `ls`, `find`, or `cat` to verify.

4. **Don't refactor unrelated code.** Stay in scope. If you see something outside your ticket that needs fixing, note it — don't fix it. Scope creep is the #1 agent failure mode.

5. **Don't write tests that mirror implementation.** Tests verify *behavior from the outside*, not internal logic. If your test reads like a copy of the implementation, it's useless.

6. **Don't use placeholder implementations.** No `// TODO`, no `throw new Error('not implemented')`, no empty function bodies unless the ticket explicitly calls for stubs.

7. **Don't invent abstractions prematurely.** Write the concrete thing first. Extract only when duplication is real (rule of three).

8. **Don't commit without running quality gates.** Every. Single. Time. Run `bun run test && bun run typecheck && bun run lint` before any commit that touches code.

9. **Don't skip reading the ticket and design doc.** The answer to "what should I build?" is in the ticket and design doc, not in your training data. Read them completely before writing any code.

10. **Don't make assumptions about unchanged code.** If you need to modify a file, read it first. Don't assume you know what's there from a previous session.
