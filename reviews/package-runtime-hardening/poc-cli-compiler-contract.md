# POC Review: CLI ↔ ui-compiler Build Contract

- **Author:** caracas
- **Reviewer:** adversarial-review agent
- **Date:** 2026-03-11

## Changes

- plans/poc-cli-ui-compiler-contract.md (new)
- plans/package-runtime-hardening.md (modified — section 5.1)

## Review Checklist

- [x] Delivers what the ticket asks for (#1161 acceptance criteria)
- [x] Code references are accurate (verified against source files)
- [x] Recommendation is correct (`createVertzBunPlugin` over `compile()`)
- [x] Success and failure path examples are concrete and testable
- [x] No security issues

## Findings

### Finding 1 (Medium) — Vite framing is stale
The issue and orchestrator reference Vite, but no Vite dependency exists. The POC should correct this explicitly.
**Resolution:** Added "Note: Vite is no longer in the picture" section.

### Finding 2 (Medium) — Implementation plan tension
Implementation plan Phase 4 says `@vertz/ui-compiler` is the contract; POC concludes `@vertz/ui-server/bun-plugin`. These contradict.
**Resolution:** Added "Implementation Plan Correction" section listing specific updates needed.

### Finding 3 (Low) — Pipeline stage count
Stated "8 stages" but actual count is 10 distinct operations.
**Resolution:** Updated to list all 10 stages and corrected references throughout.

### Observation — Dev-mode smoke check cost
`createVertzBunPlugin()` runs `generateAllManifests()` which would duplicate work if the dev server also creates a plugin instance.
**Resolution:** Added "Dev-Mode Smoke Check: Cost Considerations" section with three options.

## Verdict

Approved. All findings addressed.
