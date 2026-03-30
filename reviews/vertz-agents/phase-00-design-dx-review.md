# Phase 0: Design DX Review — `@vertz/agents`

- **Author:** Design team
- **Reviewer:** DX reviewer (Claude Opus 4.6)
- **Document:** `plans/vertz-agents.md` (Rev 1)
- **Date:** 2026-03-30

## Review Summary

**Verdict: Changes Requested** — 3 blockers, 8 should-fix, 6 nits.

The API surface generally follows Vertz conventions well. The `agent()` and `tool()` factories feel natural alongside `entity()` and `service()`. However, several DX inconsistencies and underspecified areas need resolution.

---

## Findings

### B1: `tool()` naming diverges from `action()` [Blocker]

`action()` uses `body`/`response`, but `tool()` introduces `input`/`output`. This violates "one way to do things." An LLM trained on Vertz will hallucinate the wrong names.

Need to either align naming or explicitly document why tools use different vocabulary (LLM function-calling convention) with a migration plan.

### B2: Workflow `step()` input callback has inconsistent signatures [Blocker]

First step receives `ctx` (with `ctx.workflow.input`), subsequent steps receive `prev` (accumulated outputs). Same parameter position, different names, different shapes. Needs a single unified callback shape where every step gets the same context object containing both workflow input and previous results.

### B3: `parallel` property on steps is backwards [Blocker]

Each parallel step must list its siblings by name. Adding a 4th parallel step requires updating all existing ones. Error-prone, redundant (parallelism is symmetric), and not how Vertz does things. Should use a grouping construct (`step.parallel([...])`) or dependency model (`after: 'step-name'`).

### S1: `agents()` wrapper in `createServer` is redundant [Should-fix]

Entities/services use plain arrays. Agents shouldn't need a wrapper function.

### S2: `model` config conflates provider, prompt, and token budget [Should-fix]

Split into separate config sections for provider settings vs. agent behavior.

### S3: `invoke()` should be on `ctx`, not a standalone import [Should-fix]

Auth propagation and consistency with `ctx.entities`.

### S4: `goto` in workflow steps is stringly-typed [Should-fix]

Violates "if it builds, it works" unless proven type-safe.

### S5: `when` uses raw callbacks [Should-fix]

Inconsistent with `rules.*` declarative philosophy. Acceptable as v1 limitation if acknowledged.

### S6: No `description` field on `agent()` [Should-fix]

Tools have it, agents should too.

### S7: `execution: 'client'` on tools is under-specified [Should-fix]

Remove from API surface or fully specify the protocol.

### S8: No agent-level `sandbox` default [Should-fix]

Tools can't inherit a sandbox, must repeat config each time.

### N1: `onStuck` appears as both loop config and lifecycle hook [Nit]

Rename loop option to `stuckStrategy` to disambiguate.

### N2: `checkpointEvery: 5` is ambiguous [Nit]

Iterations or seconds? Rename to `checkpointInterval` or make explicit.

### N3: `state` + `initialState` is verbose [Nit]

Consider deriving from schema defaults when possible.

### N4: Missing `kind: 'agent'` discriminant [Nit]

Entity/service both have `kind`. **Note: Already addressed in implementation.**

### N5: `access` keys differ between agents and workflows [Nit]

Agents use `invoke`, workflows use `start`. Document convention explicitly.

### N6: E2E `badPipeline` test doesn't prove what it claims [Nit]

First step has no previous steps, so `prev` is empty regardless.
