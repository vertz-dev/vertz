# Engineering Rules — Condensed Playbook

> Mandatory reading for all vertz team agents. Full rules live in
> `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/` and `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/`.
> When in doubt, read the full rule file.

---

## The Four Laws of Web Development

*Inspired by Asimov. Hierarchical — a lower law may never override a higher one.*

### 0th Law: Security is non-negotiable.
A framework shall not compromise security, nor by inaction allow security to be compromised. No `eval()`, no hardcoded secrets, no unsanitized input, no bypassed auth. Security gates may add friction (login screens, auth flows, CSP headers) — that friction is the cost of a functioning internet. We never sacrifice security for UX or DX convenience.

### 1st Law: UX is sacred.
A framework shall not harm the end-user experience, nor by inaction allow the end-user experience to be harmed, except where it would conflict with the Zeroth Law. Performance, reliability, accessibility — every millisecond matters. A performance regression is a First Law violation (P0).

### 2nd Law: DX serves the user.
A framework shall deliver exceptional developer experience, except where it would conflict with the Zeroth or First Law. DX exists so developers can build better products for users — not as an end in itself.

### 3rd Law: System integrity serves both.
A framework shall protect its own architecture, type safety, and process integrity, except where it would conflict with the Zeroth, First, or Second Law.

**Use the Laws to break ties.** When two valid approaches conflict, the higher law wins. Convenience (2nd/3rd) never justifies degraded UX (1st). UX shortcuts never justify security holes (0th). The laws cascade: if security is broken (0th ❌), everything downstream is compromised.

---

## Core Principles

### Determinism
Builds, tests, deploys, and CI must be reproducible. Same input → same output. Local and CI must behave identically. Flaky infrastructure is a process violation. We don't tolerate "works on my machine" or "CI was just being weird." If it's not deterministic, it's broken.

### Fail Fast, Fix Even Faster
Surface errors as early as possible — don't let them compound. TDD is the embodiment of this: write the test first, watch it fail (fast), fix it immediately (faster). This applies beyond code: catch design misalignments in review, catch process gaps in audits, catch regressions in CI. The cost of a bug grows exponentially with the distance from where it was introduced to where it's caught. Shrink that distance to zero.

### Audit Grades Enforce Rework

Every merged PR gets audited. Bad grades have consequences:

| Grade | Action |
|-------|--------|
| **A** | No action needed. Exemplary work. |
| **B** | Minor feedback noted. No rework required. |
| **C** | Document lessons learned. Flag process gaps. No rework required. |
| **D** | **Mandatory rework.** Revert the PR and redo the work from scratch following strict TDD. Do NOT reuse the original code — write it fresh, test-first. The point is to prove the work through the process, not to rubber-stamp existing code. |
| **F** | **Mandatory revert + redo.** Same as D, but escalate to CTO. Critical violations (security, data loss) may require immediate revert before redo is complete. |

**Why no code reuse on D/F?** Because TDD isn't about having tests — it's about the tests *driving* the implementation. Copying code and writing tests after is speculative testing. You're testing what you wrote, not writing what you test. The whole point of TDD is that the test comes first, fails, and the implementation exists *only* to make it pass. Reusing code bypasses this entirely.

**The process IS the product.** Code that works but was written without TDD is accidental correctness. We need *proven* correctness through red-green-refactor.

---

## Quick Reference

```
Branch:    feat/<name>, fix/<name>, chore/<name>
Commit:    type(scope): desc         e.g. feat(db): add health check
TDD:       Red → Green (test+typecheck+lint) → Refactor
Pre-push:  bun run test && bun run typecheck && bun run lint
PR:        Never to main directly. Bot review + CI green.
Done:      All acceptance criteria + tests + gates + review.
Bot git:   /Users/viniciusdacal/openclaw-workspace/backstage/bots/git-as.sh $AGENT_BOT <cmd>
Bot gh:    /Users/viniciusdacal/openclaw-workspace/backstage/bots/gh-as.sh $AGENT_BOT <cmd>
```

---

## Reading Order by Task Type

**Implementing a feature:**
1. This file (RULES.md)
2. Your ticket in GitHub Projects board (#2): https://github.com/orgs/vertz-dev/projects/2
3. The design doc in `plans/`
4. `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/tdd.md`
5. `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/commits.md`
6. `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/definition-of-done.md`

**Fixing a bug:**
1. This file → ticket → `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/bug-process.md`

**Writing a design doc:**
1. This file → PRD → `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/design-docs.md`

**Reviewing a PR:**
1. This file → `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/pr-policies.md` → `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/review-followups.md`

**Delegating work (MANDATORY TEMPLATES):**
1. **Assigning a phase:** Use `.claude/templates/phase-delegation.md`
2. **Breaking into subtasks:** Use `.claude/templates/subtask-delegation.md`
3. **Requesting review:** Use `.claude/templates/review-delegation.md`

**Why templates?** Inconsistent delegation is a root cause of process failures. Templates ensure every delegation includes design references, constraints, success criteria, and architectural approach — not just "do this thing."

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

Full rules: `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/tdd.md`, `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/tdd-enforcement.md`

---

## Git & PR Policies

### ALL Work Goes Through GitHub PRs — No Exceptions

- **Never push to `main` directly** — all changes go through PRs
- **Never commit directly to `main`** — except trivial changes (e.g., `.gitignore`, typo fixes in comments)
- **No local-only workflows** — all work must be visible in GitHub for audit and compliance
- **PRs are mandatory** — even for hotfixes, small changes, and urgent fixes

### Workflow

1. **Create a feature branch:** `feat/<ticket-id>-<description>`, `fix/<ticket-id>-<description>`, `chore/<ticket-id>-<description>`
2. **Push the branch:** Use `bots/git-as.sh $AGENT_BOT push origin <branch-name>`
3. **Open a PR:** Use `bots/gh-as.sh $AGENT_BOT pr create --title "..." --body "..." --base main`
4. **PR Monitor** assigns reviewers automatically (cross-bot review required)
5. **Auto-merge:** When CI passes + approved by different bot → auto-merge enabled
6. **Post-merge audit:** Every merged PR gets graded by the auditor bot

### Bot Scripts (Required)

- **Git:** `bots/git-as.sh $AGENT_BOT <command>` — all git operations
- **GitHub:** `bots/gh-as.sh $AGENT_BOT <command>` — all GitHub operations (PRs, reviews, merges)

### Rules

- **Never merge PRs to `main`** — auto-merge when CI green + approved by different bot
- **Never review your own PR** — reviews must come from a different bot
- **Never commit without a ticket**
- **Branch naming:** `feat/<name>`, `fix/<name>`, `chore/<name>`
- **One feature branch per design** — phase PRs target the feature branch
- **Changeset required** for any package change

Full rules: `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/pr-policies.md`

---

## Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Scope by package: `feat(db):`, `fix(ui-compiler):`
- Keep commits atomic — one logical change per commit
- Reference ticket ID when applicable

Full rules: `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/commits.md`

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

Full rules: `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/dev-lifecycle.md`

---

## Bug Fix Process

- **Tier 1 (Critical):** Fix immediately, open PR, request expedited review.
- **Tier 2 (Important):** Ticket + PR, one reviewer.
- **Tier 3 (Minor):** Batch into next milestone.

All tiers require tests. Full rules: `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/bug-process.md`

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
- [ ] **Developer Walkthrough passes** (see below)

Full rules: `/Users/viniciusdacal/openclaw-workspace/vertz/.claude/rules/definition-of-done.md`

---

## Developer Walkthrough Gate — MANDATORY

> **"It works" ≠ "someone can use it."** A rendering engine that produces perfect HTML
> but needs 400 lines of glue code is not a feature — it's a toolkit. We ship features.

Every feature ticket MUST include a **Developer Walkthrough** section. The feature is NOT done until this walkthrough passes end-to-end.

### What a Developer Walkthrough looks like

```markdown
## Developer Walkthrough (must pass before closing)

1. Start from a clean `npm create vertz-app` project (or minimal existing project)
2. Follow ONLY the public docs/README to enable [feature]
3. Run the standard dev command (`vite dev`, `bun run dev`, etc.)
4. Verify [expected user-visible outcome] in the browser/terminal
5. No undocumented steps. No copying from examples. No reading source code.
```

### Rules

1. **Acceptance criteria must include at least one user outcome** — not just "renderToStream returns valid HTML" but "developer runs `vite dev` and view-source shows rendered HTML."

2. **Examples must use only the public API** — if an example imports internal modules, writes custom glue code, or needs a different dev command than documented, that's a framework bug, not a feature of the example.

3. **"Fresh start" test before milestone close** — before marking any milestone done, someone must go through the setup from scratch in a new project. "It works in our monorepo" is not sufficient.

4. **The "5-minute rule"** — can a developer go from zero to working in 5 minutes with just the docs? If not, the feature isn't done.

### Review gate question

When reviewing any PR that adds or completes a feature, explicitly ask:

> **"Can a developer use this without reading the source code?"**

If the answer is no, the PR is not ready to merge.

---

## Feature Design — Vertical Slices

> Primitives without integration are not features. Never ship a "Phase N: internals"
> without also shipping the integration that makes it usable.

### Slice, don't layer

**Wrong (horizontal layers):**
```
Phase 5: Build renderToStream, Suspense, hydration markers (all internals)
Phase 8: Wire it into the Vite plugin (integration, done months later... or never)
```

**Right (vertical slices):**
```
Slice 1: vite dev serves SSR HTML for a simple component (end-to-end)
Slice 2: Add streaming SSR with Suspense (still end-to-end)
Slice 3: Add head management (still end-to-end)
Slice 4: Add hydration (still end-to-end)
```

### Rules

1. **Every slice must be usable on its own.** No slice ships without the integration/DX layer.

2. **First slice = thinnest possible end-to-end.** Get the developer-facing flow working (even minimally) before building out the internals.

3. **If a PR adds internals with no user-facing integration, it must be explicitly labeled as such** and a follow-up ticket for the integration must exist and be linked. The parent feature stays open until integration ships.

4. **When planning features, start from the developer experience and work backward.** Write the ideal `vite.config.ts` / API call / CLI command first, then figure out what internals are needed. Not the other way around.

---

## Delegation & Coordination

**All work delegation MUST use the templates in `.claude/templates/`:**

- **Phase delegation** → `.claude/templates/phase-delegation.md`
- **Subtask delegation** → `.claude/templates/subtask-delegation.md`
- **Review requests** → `.claude/templates/review-delegation.md`

**Why templates are mandatory:**

The Phase 1 failure (errors-as-values unification) happened because delegation was ad-hoc:
- Design doc said "re-export from @vertz/errors"
- Implementation duplicated 200+ lines instead of re-exporting
- Review approved without checking against design doc
- Caught only when CTO read the code manually

Templates prevent this by forcing:
1. **Design reference** - Link to specific design doc section
2. **Architectural constraints** - What approach to use, not just what outcome to achieve
3. **Expected diff size** - If actual changes differ significantly, stop and coordinate
4. **Review checklist** - Verify design compliance, not just that tests pass

**Coordination requirements:**

- If touching packages you don't own → coordinate with owner first
- If deviating from design doc → escalate to CTO before continuing
- If blocked by another agent's work → communicate the dependency explicitly
- If scope expands beyond ticket → stop and get new ticket, don't expand organically

**Red flags that mean you should stop and coordinate:**

- Diff is much larger/smaller than expected from design
- Files changed that weren't in the delegation scope
- Tests passing but implementation approach doesn't match design
- Multiple ways to solve it and design doc doesn't specify which

---

## Bot Identity

- Check `AGENT_BOT` env var to know who you are
- Read `/Users/viniciusdacal/openclaw-workspace/backstage/team.json` for your role and ownership
- Stay in your lane — don't modify packages you don't own without coordinating
- All git/GitHub ops through bot scripts — never use personal credentials

Full rules: `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/bot-roles.md`

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

### Security (Zeroth Law)
- No `eval()` or `new Function()`
- **No shell string interpolation** — never use `execAsync()` or `exec()` with template literals. Always use `spawn()` with argument arrays: `spawn('cmd', ['--arg', value])`. This prevents command injection (CWE-78).
- Sanitize user input in examples and docs
- Document security implications of any API that handles raw HTTP
- A single critical security violation is an **automatic F** in audits, regardless of other quality

---

## Secret Management

- **Never hardcode secrets** — all credentials come from Doppler via env vars
- **Never log or print secrets**
- **Never commit `.env` files**

Full rules: `/Users/viniciusdacal/openclaw-workspace/backstage/.claude/rules/secret-management.md`

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

11. **Don't deliver the wrong ticket's work.** Read the ticket ID in your branch name. Read the actual ticket. Verify what you're building matches what was asked. If the ticket says "5 diagnostic rules" and you're writing bug fixes, stop.

12. **Don't create branches from a dirty worktree.** Always use `git worktree add` for isolated work. If your PR diff contains files from another feature, you've broken isolation. Check `git status` before branching.

13. **Don't ship code that handles external input without spawn().** Any code that shells out with user-controllable input MUST use `spawn()` with argument arrays. This is a Zeroth Law (security) requirement. Violations are automatic F grades.
