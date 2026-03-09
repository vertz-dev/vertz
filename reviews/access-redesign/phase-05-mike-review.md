# Phase 5: Billing Integration — Mike (Architecture) Review

- **Author:** agent
- **Reviewer:** mike
- **Date:** 2026-03-09

## Review Checklist

- [x] Architecture follows design doc
- [x] No hidden complexity
- [x] Extensible for future adapters
- [x] Clean separation of concerns

## Findings

### Approved

**Architecture quality:**
- Clean layering: adapter (interface) → stripe-adapter (impl) → webhook-handler (consumer) → event-emitter (output)
- BillingAdapter interface is adapter-pattern correct — future LemonSqueezy/Paddle adapters just implement the same interface
- StripeClient interface is defined locally, not imported from `stripe` package — makes the `stripe` package a true optional peer dep
- Webhook handler is framework-agnostic (Request → Response), not tied to any specific HTTP framework
- Event emitter is decoupled from webhook handler — they share types but not implementation

**Architecture concerns:**
1. **Webhook signature validation should be pluggable** — current hardcoded string comparison means switching to real HMAC requires modifying the handler. A `validateSignature` callback in the config would be better. Non-blocking for Phase 5.
2. **No tenant-to-Stripe-customer mapping** — `createSubscription()` takes `tenantId` but the Stripe adapter needs to map this to a Stripe customer ID. This mapping isn't stored anywhere. This is expected since those methods are placeholder stubs.
3. **Event emitter is synchronous** — handlers are called synchronously in a for loop. If a handler throws, subsequent handlers won't fire. Should consider try/catch per handler. Non-blocking.

## Resolution

All concerns are non-blocking for Phase 5. The architecture is sound for the initial building blocks. Pluggable signature validation and async-safe event emitter are natural improvements for future phases.
