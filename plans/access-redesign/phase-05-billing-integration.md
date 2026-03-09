# Phase 5: Billing Integration

**Prerequisites:** [Phase 4 — Versioning + Grandfathering](./phase-04-versioning-and-grandfathering.md)

**Goal:** Implement Stripe sync adapter, webhook handler for subscription lifecycle events, billing event emitter, and the payment processor abstraction layer.

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: Stripe Sync, Webhook Handling, Payment Processor Abstraction, Limit Overage Billing (billing computation part).

---

## Context — Read These First

- `packages/server/src/auth/define-access.ts` — Phase 1-4 output
- `packages/server/src/auth/plan-store.ts` — Phase 2 output (plan assignments)
- `packages/server/src/auth/plan-version-store.ts` — Phase 4 output (versioned plans)
- `plans/access-redesign.md` — Stripe Sync, Webhook Handling, Overage Billing

---

## What to Implement

1. **Payment processor abstraction** — `BillingAdapter` interface:
   - `syncPlans(plans)` — push plan definitions to the processor
   - `createSubscription(tenantId, planId)` — create subscription
   - `cancelSubscription(tenantId)` — cancel subscription
   - `attachAddOn(tenantId, addOnId)` — attach add-on to subscription
   - `reportOverage(tenantId, limitKey, amount)` — report metered usage
   - `getPortalUrl(tenantId)` — billing portal URL

2. **Stripe adapter** — `StripeBillingAdapter` implementing `BillingAdapter`:
   - `syncToStripe({ apiKey })` — idempotent push of plan config to Stripe Products + Prices
   - Mapping: plan → Product + Price, group → Product metadata, add-on → Product with `addOn: true` metadata, version → metadata
   - New version → new Stripe Price (old archived, not deleted)

3. **Webhook handler** — `access.billing.webhookHandler()`:
   - Returns a `(request: Request) => Promise<Response>` handler
   - Validates webhook signatures
   - Maps Stripe events to framework actions:
     - `subscription.created` → assign plan
     - `subscription.updated` → update plan
     - `subscription.deleted` → revert to defaultPlan
     - `invoice.payment_failed` → emit event
     - `invoice.paid` → clear failure state
     - `checkout.session.completed` → activate plan or add-on

4. **Billing event emitter** — `access.billing.on(event, handler)`:
   - `subscription:created` — `{ tenantId, planId }`
   - `billing:payment_failed` — `{ tenantId, planId, attempt }`
   - `subscription:canceled` — `{ tenantId, planId }`

5. **Overage billing computation** — at billing cycle end:
   - `(consumed - max) × overage.amount` = overage charge
   - Report to payment processor as metered line item
   - Respects overage cap if configured

6. **`access.plans.syncToStripe()`** — convenience method delegating to the Stripe adapter.

---

## Files to Create/Modify

```
packages/server/src/auth/
├── billing/
│   ├── adapter.ts              # NEW — BillingAdapter interface
│   ├── stripe-adapter.ts       # NEW — StripeBillingAdapter
│   ├── webhook-handler.ts      # NEW — webhook handler factory
│   ├── event-emitter.ts        # NEW — billing event emitter
│   └── overage.ts              # NEW — overage computation
├── define-access.ts            # MODIFY — wire billing adapter, syncToStripe
├── types.ts                    # MODIFY — BillingAdapter, BillingEvent types
├── index.ts                    # MODIFY — export billing types
```

### Test Files

```
packages/server/src/auth/__tests__/
├── billing/
│   ├── stripe-adapter.test.ts    # NEW (mock Stripe API)
│   ├── webhook-handler.test.ts   # NEW
│   ├── event-emitter.test.ts     # NEW
│   └── overage.test.ts           # NEW

packages/integration-tests/src/__tests__/
├── auth-billing.test.ts          # NEW — full billing flow E2E
```

---

## Expected Behaviors to Test

### Stripe adapter (`stripe-adapter.test.ts`)

- [ ] `syncPlans()` creates Stripe Products for each plan
- [ ] `syncPlans()` creates Stripe Prices with correct amounts/intervals
- [ ] `syncPlans()` is idempotent — running twice produces same result
- [ ] `syncPlans()` stores plan ID and version in Product metadata
- [ ] New plan version → new Price created, old Price archived
- [ ] Add-on plans have `addOn: true` in metadata
- [ ] Plan `group` stored in Product metadata
- [ ] Free plans (no price) create Product with $0 Price

### Webhook handler (`webhook-handler.test.ts`)

```typescript
describe('Feature: Stripe webhook handler', () => {
  describe('Given subscription.created event', () => {
    it('assigns plan to tenant via PlanStore', () => {})
  })

  describe('Given subscription.updated event (upgrade)', () => {
    it('updates tenant plan assignment', () => {})
  })

  describe('Given subscription.deleted event', () => {
    it('reverts tenant to defaultPlan', () => {})
  })

  describe('Given invoice.payment_failed event', () => {
    it('emits billing:payment_failed event', () => {})
  })

  describe('Given checkout.session.completed for add-on', () => {
    it('attaches add-on to tenant', () => {})
  })

  describe('Given invalid webhook signature', () => {
    it('returns 400 response', () => {})
  })
})
```

### Billing events (`event-emitter.test.ts`)

- [ ] `on()` registers handler for event type
- [ ] Handler receives correct payload `{ tenantId, planId }`
- [ ] Multiple handlers for same event all fire
- [ ] Unregistered event type does not throw

### Overage computation (`overage.test.ts`)

- [ ] `computeOverage(consumed=150, max=100, rate=0.01)` → `$0.50`
- [ ] Within limit → `$0.00`
- [ ] At limit → `$0.00`
- [ ] Overage with cap → capped at cap amount
- [ ] Unlimited limit (max=-1) → no overage possible

---

## Quality Gates

```bash
bunx biome check --write packages/server/src/auth/
bun test --filter @vertz/server
bun run typecheck --filter @vertz/server
bun test --filter @vertz/integration-tests
```

---

## Notes

- Stripe API calls in tests should be **mocked** — do not hit real Stripe in unit or integration tests. Use a mock adapter that tracks calls.
- The `BillingAdapter` interface is designed for future adapters (LemonSqueezy, Paddle). Only Stripe is implemented in this phase.
- Webhook signature validation uses Stripe's `stripe.webhooks.constructEvent()` — requires the webhook signing secret.
- Overage billing is reported at the end of a billing period. The framework needs a mechanism to trigger this — either a cron-style scheduled function or an explicit `access.billing.computeOverage()` call.
- The `stripe` npm package is an optional peer dependency — not required unless billing is configured.
