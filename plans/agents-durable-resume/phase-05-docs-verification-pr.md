# Phase 5: Docs + CF DO Verification + Changeset + PR — follow-up

## Context

Phases 1–4 delivered: durable primitives, per-step atomic writes, resume
detection, and `safeToRetry` opt-in. All E2E tests green. This phase is
the "release" work — docs, changeset, retro, rebase, PR to main, CI
monitoring.

---

## Tasks

### Task 1: Update `packages/mint-docs/`

**Files:** (≤5)
- `packages/mint-docs/docs/agents/durable-resume.mdx` (new — the guide)
- `packages/mint-docs/docs/agents/tools.mdx` or equivalent (modified — add
  `safeToRetry` reference + FAQ line clarifying it's about **resume
  replay**, NOT network retry)
- `packages/mint-docs/docs/agents/stores.mdx` or equivalent (modified —
  `appendMessagesAtomic` mention + `MemoryStoreNotDurableError` note)
- `packages/mint-docs/mint.json` (modified — add the new guide to nav)
- Inline code example files if needed — keep the count ≤ 5

**What to write:**

The guide covers:
- Why durable resume exists (triagebot / side-effecting agents / DO
  preemption).
- How to activate it — pass `store + sessionId` to `run()`. No flag.
- The memory-store guardrail — what throws, why, when.
- The crash taxonomy table from the design doc (simplified for users).
- `safeToRetry` flag — when to use, when NOT to use.
- Cost impact — "expect ~2 D1 writes per step; for high-volume read-heavy
  agents consider running stateless (omit sessionId)."
- FAQ:
  - **Q: Does `safeToRetry` affect HTTP/network retries?**
    **A:** No. It only controls whether the framework re-invokes a tool's
    handler during session resume (after a crash between write phases). It
    does nothing for transient network errors during normal execution.
  - **Q: What happens if my DO is evicted mid-write?**
    **A:** D1 commits are the source of truth. Next request to the same DO
    calls `run()`; resume reads the durable state and proceeds.

**Acceptance criteria:**
- [ ] Guide exists, linked from nav, renders without errors.
- [ ] `safeToRetry` FAQ present with the resume-vs-network-retry clarification.
- [ ] Cost guidance present.
- [ ] Crash taxonomy covered in user-readable form.

---

### Task 2: CF DO manual verification checklist

**Files:** (1)
- `plans/post-implementation-reviews/agents-durable-resume.md` (new — the
  retrospective document; includes a "manual verification checklist"
  section with the CF DO steps run against triagebot)

**What to do:**

Trigger `triagebot` in a Cloudflare DO staging environment:
1. Configure DO with `d1Store` + `run()` using the new framework.
2. Prime a run with a toolCall to `postSlack`.
3. Force a crash by throwing in the middle of the handler (via a feature
   flag in the handler or by killing the DO process during the
   `appendMessagesAtomic` second write). Verify Slack shows exactly one
   post.
4. Trigger the same DO a second time with the same sessionId; verify the
   framework detects the orphan and surfaces `ToolDurabilityError` in
   history (LLM's response should acknowledge it). Verify no second
   Slack post.
5. Re-do with a `safeToRetry: true` read tool — verify it IS re-invoked
   on resume.

Record steps + results in the retrospective.

**Acceptance criteria:**
- [ ] Retrospective exists with all steps + observed results.
- [ ] No double-post observed.
- [ ] `safeToRetry` retry observed.
- [ ] Phase 1 perf measurement (`durable-resume.perf.local.ts`) recorded
      in the retro.

---

### Task 3: Changeset + rebase + PR

**Files:** (≤4)
- `.changeset/agents-durable-resume.md` (new — patch bump per
  `.claude/rules/policies.md`)
- Rebase the feature branch on latest `main` and resolve any conflicts
- Push
- Open PR with title `feat(agents): durable tool execution + transactional
  resume [#2835]`

**What to include in the PR description:**
- Summary of all 5 phases.
- Public API Changes:
  - Added: `AgentStore.appendMessagesAtomic(...)`, `MemoryStoreNotDurableError`,
    `ToolDurabilityError`, `tool({ safeToRetry })`, `@vertz/agents/testing`
    subpath with `crashAfterToolResults`.
  - Removed: `AgentLoopConfig.checkpointInterval`,
    `ReactLoopOptions.onCheckpoint` (pre-v1, no shim).
- Consolidated review findings + resolutions from all 5 phases.
- E2E test status (both scenarios GREEN).
- Reference: closes #2835.

**Acceptance criteria:**
- [ ] Changeset added (patch bump).
- [ ] Branch rebased on latest main; quality gates re-run post-rebase.
- [ ] PR opened; CI started.
- [ ] Monitor CI (`gh pr checks <pr-number> --watch`) until green.
- [ ] Notify user only after CI is fully green.

---

## Quality gates before push (must all pass)

```bash
vtz test --filter=@vertz/agents
vtz run typecheck --filter=@vertz/agents
vtz run lint --filter=@vertz/agents
# And cross-package:
vtz test
vtz run typecheck
vtz run lint
```

## Definition of done

- [ ] All 5 phases merged to the feature branch.
- [ ] E2E acceptance test passing (both scenarios).
- [ ] Docs live.
- [ ] Changeset present.
- [ ] Retrospective written.
- [ ] CF DO manual verification recorded.
- [ ] PR CI green.
- [ ] User notified; awaiting human merge.
