# Technical Review: Orchestrator Dashboard Design Doc

**Reviewer:** Technical Agent
**Date:** 2026-04-07
**Verdict:** **CHANGES REQUESTED** (both blockers now resolved in Rev 2)

---

## What's Good

- Phasing is sensible. P1 and P2 are independent, P5 is the natural convergence.
- Hybrid DOM/Canvas was the right call (now fully DOM).
- Fallback plan for SSE shows awareness of runtime constraints.

---

## Findings

### BLOCKER-1: StepProgressEvent has no source (RESOLVED)
The workflow executor modification was unscoped.
**Resolution:** Added Phase 0 scoping the `onStepProgress` callback on the workflow executor.

### BLOCKER-2: SSE runtime target ambiguity (RESOLVED)
Phase 1 both delivered and validated SSE feasibility.
**Resolution:** Clarified: Bun is the runtime. SSE works natively. No ambiguity.

### Should-Fix

**SF-1: ui-canvas Phase 2 dependency** -> Resolved: DOM-based diagram
**SF-2: Auto-layout algorithm unspecified** -> Added: topological sort + column assignment
**SF-3: In-memory store lifecycle** -> Added Section 10: retention (100 max), restart (data lost), concurrency (single-threaded safe)
**SF-4: Type flow map lacks tracing** -> Added: explicit monomorphic note, SSE validation with @vertz/schema
**SF-5: Markdown renderer TBD** -> Chose `marked` for rendering, textarea+preview for editing

### Nits (all addressed)

- N-1: POST/GET inconsistency -> Standardized to POST
- N-2: SSE reconnection strategy -> Added snapshot-on-connect, heartbeat, EventSource auto-reconnect
- N-3: SSE testing strategy -> Added Section 11 with async iterable test helper

---

## Post-Resolution Verdict

With both blockers resolved and all should-fix items addressed, this design is **APPROVED** for implementation.
