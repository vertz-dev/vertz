# Product/Scope Review: Orchestrator Dashboard

- **Reviewer:** Product/Scope Agent
- **Date:** 2026-04-07
- **Verdict:** **APPROVED with should-fix items**

---

## What's Good

- **Strong dogfooding angle.** Building a real internal tool with the full Vertz stack surfaces real DX pain points.
- **Non-goals are well-scoped.** No auth, no mobile, no persistence, no drag-and-drop builder.
- **Phase 1 delivers standalone value.** SSE streaming and step/artifact inspection is meaningful over 3s polling.
- **Phases 1 and 2 parallelizable.** Live monitoring and flow diagram are independent.
- **Tech stack is pure Vertz.** No external UI libraries, no React shims.

---

## Findings

### Should-Fix

**SF-1: Phase 2 scope risk — imperative canvas for a read-only diagram**
Building with imperative PixiJS produces throwaway code when JSX ships.
**Resolution:** Switched to DOM-based diagram. No canvas dependency.

**SF-2: SSE is a blocker hiding as an unknown**
Phase 1 can't both deliver and validate SSE feasibility.
**Resolution:** Clarified runtime is Bun. SSE works natively. Not an unknown.

**SF-3: Phase 3 dependency on Phase 2 is artificial**
Prompt editor doesn't need flow diagram.
**Resolution:** Decoupled. Phase 3 depends on Phase 1 only.

### Nits (all addressed)

- N-4: Phase 4 too broad -> Split into 4a (error/run mgmt) and 4b (UX polish)
- N-5: Workflow definition discovery unspecified -> Added: runtime-registered, dev-orchestrator-specific
- N-6: "50+ runs" vague -> Clarified: 20 per page, 100 max in store

---

## Scope Assessment

| Aspect | Assessment |
|---|---|
| Fits roadmap | Yes — dogfooding Vertz for internal tools |
| Scope size | Right-sized after Phase 4 split |
| Phase 1 standalone value | Yes, strong |
| Scope creep risk | Low — canvas removed, phases decoupled |
| Time to value | Good — Phase 3 no longer gated on Phase 2 |
