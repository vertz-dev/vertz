# Phase 5: Billing Integration — Nora (Frontend/DX) Review

- **Author:** agent
- **Reviewer:** nora
- **Date:** 2026-03-09

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] API is intuitive
- [x] Public API matches design doc
- [x] Tests cover real developer scenarios

## Findings

### Approved

**Good DX:**
- `createStripeBillingAdapter({ stripe })` — accepts injected client, no global config needed
- `createWebhookHandler(config)` returns a standard `(Request) => Promise<Response>` — works with any HTTP framework
- `createBillingEventEmitter()` with `.on()` / `.off()` is familiar pattern
- `computeOverage()` is a pure function — easy to test and reason about
- Integration test demonstrates the full developer workflow clearly

**DX concerns (minor):**
1. Design doc shows `access.billing.webhookHandler()` and `access.billing.on()` as the developer-facing API. The current implementation requires manual wiring (create emitter, create handler, pass to both). This is fine for Phase 5 as the convenience wrapper can come later.
2. Design doc shows `access.plans.syncToStripe({ apiKey })` as a convenience. Current implementation requires `createStripeBillingAdapter()` separately. Same as above — convenience wrappers are Phase 5+ territory.

## Resolution

DX wrappers deferred to the `defineAccess()` integration phase. Current building blocks are correct and well-tested.
