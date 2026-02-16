# PROCESS.md - Vertz Agent Engineering Process

This document defines how work gets done at Vertz. All agents must follow these processes. This is a living document — agents should suggest updates when gaps are found.

---

## 1. Verification Pyramid

Work is verified at five levels, each with machine-checkable checkpoints:

### Level 1: Code (TDD)

**Process:**
1. Write test first → expect failure (red)
2. Implement minimum code to pass → expect success (green)
3. Refactor for clarity → ensure tests still pass
4. Push with pre-push gates

**Enforcement:**
- Turbo gates run on every push (`lefthook pre-push`)
- Trojan source check scans every push for invisible characters or encoding attacks
- No exceptions: code without tests is not merged

**Example:**
```bash
# 1. Write test
echo "describe('add', () => { it('returns sum', () => expect(add(2,3)).toBe(5)) })" > add.test.ts

# 2. Run test → red
bun test add.test.ts  # FAIL

# 3. Implement
echo "export const add = (a: number, b: number) => a + b" > add.ts

# 4. Run test → green
bun test add.test.ts  # PASS

# 5. Refactor if needed, then push
git push
```

### Level 2: Task (Definition of Done)

Every task MUST have machine-verifiable acceptance criteria before work begins.

**Requirements:**
- Agent runs verification before reporting "done"
- If verification fails, agent fixes — no human in the loop for mechanical checks
- Verification commands must be executable without human judgment

**Template:**
```
## Acceptance Criteria (machine-verifiable)
- [ ] `turbo run test` passes
- [ ] `git diff main --stat` shows only expected files
- [ ] Specific verification commands
```

### Level 3: PR (Automated Review Gate)

**Requirements be green (all checks pass)
- Review from a different:**
- CI must bot than the author
- Structured review covers: security, API conventions, test coverage, scope check
- No scope creep — PR changes only what's described

**Review Template:**
```markdown
## Review Checklist

### Security
- [ ] No secrets committed
- [ ] Input sanitization reviewed
- [ ] Dependencies up-to-date

### API Conventions
- [ ] Follows API_CONVENTIONS.md
- [ ] Public API surface documented
- [ ] Breaking changes flagged

### Test Coverage
- [ ] New code has tests
- [ ] Existing tests pass
- [ ] Coverage maintained or improved

### Scope
- [ ] Only described files changed
- [ ] No scope creep detected
```

### Level 4: Feature (Integration Verification)

After merge, verify the feature works end-to-end:

- Smoke tests for critical paths
- Check exports/imports across packages
- Verify public API surface is correct
- Run integration tests if available

**Example:**
```bash
# Smoke test: can the package be imported?
bun -e "import { vertz } from '@vertz/core'; console.log(vertz.version)"

# Verify exports
grep -r "export " packages/core/src/index.ts
```

### Level 5: Milestone (Launch Readiness)

Full-stack verification before release:

- `bun create vertz-app` → build → run completes in under 5 minutes
- All packages build (`turbo run build`)
- All tests pass (`turbo run test`)
- Docs match code (no `TODO` or `FIXME` in public APIs)

---

## 2. Task Spawning Template

Every spawned task MUST use this format:

```markdown
## Task
What to do (brief)

## Acceptance Criteria (machine-verifiable)
- [ ] `turbo run test` passes
- [ ] `git diff main --stat` shows only expected files
- [ ] Specific verification commands

## Constraints
- Scope boundaries (what NOT to touch)
- Branch ownership rules
- Read-only vs write permissions

## Verification Command
A single command or script the agent runs to confirm the task is done.
```

**Example:**
```markdown
## Task
Add rate limiting to the API client

## Acceptance Criteria (machine-veritable)
- [ ] `turbo run test --filter=api-client` passes
- [ ] `git diff main --stat` shows only `packages/api-client/src/ratelimit.ts` and `packages/api-client/src/index.ts`
- [ ] RateLimiter class exported from index

## Constraints
- Do NOT modify authentication logic
- Do NOT add new dependencies
- Read-only: configs/

## Verification Command
bun test packages/api-client/src/ratelimit.test.ts
```

---

## 3. Work Lifecycle

Full lifecycle of a work item:

1. **Issue Created** — Added to GitHub Projects (To Do column)
2. **Task Spawned** — Pipeline Orchestrator picks it up OR main agent spawns sub-agent
3. **Branch Created** — Agent creates feature branch, follows TDD
4. **Development** — Write tests → implement → verify
5. **Acceptance Check** — Agent runs acceptance criteria before claiming done
6. **PR Created** — Agent creates PR with "Fixes #N"
7. **Review** — Pipeline Orchestrator spawns reviewer (different bot)
8. **Merge** — CI + review pass → auto-merge
9. **Post-Merge Audit** — Feature verification runs
10. **Issue Closed** — Auto-closes, moves to Done in Projects

---

## 4. Kanban WIP Limits

- **Max 3 concurrent PRs** per agent identity
- **Max 5 total open PRs** across all agents
- If at limit: finish existing work before starting new

**Why?** Too many concurrent PRs creates:
- Merge conflicts
- Review bottleneck
- Context switching overhead

---

## 5. What Doesn't Apply

These are anti-patterns for agent teams — DO NOT USE:

| Anti-Pattern | Why Not |
|--------------|---------|
| Sprint planning | Agents work 24/7, continuous flow |
| Time estimation | Meaningless for agents (they don't sleep) |
| Traditional standups | Agents don't carry context between sessions |
| Blame culture | When mistakes happen, update process rules |

---

## 6. Blameless Postmortem

When something goes wrong (scope creep, broken CI, etc.):

1. **What happened?** — Factual description
2. **Why?** — Root cause analysis
3. **What process change prevents recurrence?** — Fix the system
4. **Update PROCESS.md or RULES.md** — Document the fix

**Template:**
```markdown
## Postmortem: [Incident Title]

### What happened?
[Description]

### Why?
[Root cause]

### Prevention
[Process change]

### Updated
- PROCESS.md section X
- RULES.md section Y
```

---

## 7. Key Process Rules

Reference these from existing documents:

- **TDD is sacred** — No exceptions, no shortcuts
- **Security (Zeroth Law)** — Overrides everything
- **Git is source of truth** — All work through PRs
- **API_CONVENTIONS.md** — Mandatory reading before writing code
- **Agents are reviewers OR authors** — Never both on same PR
- **No direct main pushes** — Except backstage ops (docs, chores)

---

## Living Document

This process evolves. When you find gaps, edge cases, or better approaches:

1. Document the issue in a PR comment or daily memory
2. Propose a process change
3. Update this document

Process improvements require the same PR process as code changes.
