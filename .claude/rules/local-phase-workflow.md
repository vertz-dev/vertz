# Local Phase Workflow

Phase PRs happen locally. Only the final feature branch → main PR goes to GitHub.

## Why

GitHub PRs for every phase are overhead for a team of local AI agents:
- Token scopes, API rate limits, network latency
- No benefit — the review happens locally anyway
- Slows down the pipeline for no added visibility

## How It Works

### 1. Feature Branch

Create one feature branch from main:

```bash
git checkout -b feat/<feature-name> main
```

All phase work happens as commits on this branch. No sub-branches, no GitHub PRs per phase.

### 2. Phase Work

Each phase is a series of commits on the feature branch:

```
feat/db-integration
├── Phase 1 commits (db-service)
├── Phase 1 CI ✅
├── Phase 1 review ✅
├── Phase 2 commits (table-schemas)
├── Phase 2 CI ✅
├── Phase 2 review ✅
└── ...
```

### 3. Full CI Before Every Phase Merge

Before a phase is considered "done" and the next phase starts, run the **full CI pipeline** via Dagger:

```bash
cd /app/vertz
dagger call ci
```

This runs: lint → build → typecheck → test (with Postgres). It validates the **entire monorepo**, not just the changed package — because changes in one package can break dependents.

**This is a hard gate.** If `dagger call ci` fails, the phase is not done. Fix the issue, re-run CI, and only then proceed to the next phase.

### 4. Local Phase Review

After CI passes, a **different bot** reviews the phase. The review is written as a markdown file:

```
vertz/reviews/<feature-name>/
├── phase-01-<slug>.md
├── phase-02-<slug>.md
└── ...
```

#### Review File Format

```markdown
# Phase N: <Phase Name>

- **Author:** <bot-name>
- **Reviewer:** <different-bot-name>
- **Commits:** <first-sha>..<last-sha>
- **Date:** YYYY-MM-DD

## Changes

- path/to/file.ts (new / modified / deleted)
- ...

## CI Status

- [x] `dagger call ci` passed at <commit-sha>

## Review Checklist

- [ ] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [ ] Public API changes match design doc

## Findings

### Approved / Changes Requested

<Review notes, feedback, specific issues found>

## Resolution

<How findings were addressed, or "No changes needed">
```

#### Review Rules

- Reviewer must be a **different bot** than the author
- Reviewer adversarially looks for bugs, not rubber-stamps
- If changes are requested, author fixes → re-runs `dagger call ci` → reviewer re-reviews
- Review file is updated with resolution

### 5. Final PR to GitHub

When all phases are complete:

1. Rebase the feature branch on latest `main` to ensure no conflicts
2. Run full quality gates one final time after rebase (tests, typecheck, lint)
3. **Update docs** — if the feature touches public API, update `packages/docs/` (Mintlify): new APIs, changed behavior, gotchas
4. Push the feature branch to GitHub
5. Open a single PR: `feat/<feature-name>` → `main`
6. PR description includes:
   - Public API Changes summary (mandatory per `pr-policies.md`)
   - Summary of all phases with links to local review files
   - E2E acceptance test status
7. **Monitor GitHub CI** — use `gh pr checks` or `gh run list` to track CI status
8. If CI fails: diagnose and fix locally, push again, monitor until green
9. If `main` advances while the PR is open: rebase, re-run quality gates, force-push, monitor CI again
10. **Only notify the human when CI is fully green and the PR is clean** — the human reviews and merges

```bash
git fetch origin main && git rebase origin/main
bun test && bun run typecheck && bun run lint
git push -u origin feat/<feature-name>
gh pr create --title "feat: <Feature Name>" --body "..."
# Monitor CI
gh pr checks <pr-number> --watch
```

**The entire flow from Phase 1 through CI-green PR is autonomous.** Agents do not pause between phases or after opening the PR. The human's only interaction is reviewing and merging the final PR.

### 6. After Merge

Standard post-merge process:
- Retrospective in `plans/post-implementation-reviews/`
- josh builds demo app + DX Journal
- Archive tickets
- Update dashboard

## What This Replaces

| Before | After |
|--------|-------|
| GitHub PR per phase | Local commits + local review markdown |
| `gh-as.sh` for every PR | Only for final PR to main |
| GitHub CI per phase | `dagger call ci` locally |
| Wait for GitHub API | Instant local operations |
| Multiple branches per feature | One feature branch, phases as commit ranges |

## What Doesn't Change

- **TDD is still mandatory.** Red → Green → Refactor for every behavior.
- **Reviews are still mandatory.** Different bot reviews every phase.
- **CI must pass.** Full Dagger CI, not just the changed package.
- **Human approves final merge to main.** This is the one GitHub PR.
- **Design docs and retros are still required.** Process quality doesn't change.
- **Git worktrees** are still used when multiple agents work in parallel.

## The `reviews/` Directory

- Lives in the vertz repo at `reviews/<feature-name>/`
- Created when a feature starts, deleted when the feature merges to main
- **Not committed to main** — these are working artifacts, not permanent history
- The final PR description summarizes the reviews for the permanent record
