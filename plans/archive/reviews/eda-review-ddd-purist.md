# EDA Review: DDD Purist Perspective

**Reviewer:** DDD Purist (Evans, Vernon, Khononov)
**Document:** Entity-Driven Architecture (EDA)
**Date:** 2026-02-19

---

## Overall Assessment

Entity-Driven Architecture is a thoughtful modernization of DDD for the TypeScript full-stack era. It successfully translates core DDD concepts—entities, bounded contexts, domain services—into a declarative framework that eliminates significant boilerplate. The design is internally consistent and demonstrates clear understanding of classical DDD. However, the departure from Aggregates and the simplification of Domain Events into synchronous hooks create gaps that will surface at scale, particularly in systems requiring complex transactional invariants or event-driven micro-architectures.

---

## What's Strong

- **Faithful DDD terminology mapping** — The table mapping DDD concepts to EDA equivalents is accurate and honest about where meanings diverge. Using `domain()` for Bounded Context and `service()` for Domain Service is semantically correct.
- **Entity identity correctly handled** — The `entity()` concept preserves identity (`id`), encapsulates state, and exposes behavior through actions. This aligns with Evans' definition.
- **Clean separation of concerns** — The distinction between persisted entities, action entities (Application Services), and semantic entities (read models) maps cleanly to CQRS and DDD layering.
- **Access rules at the right level** — Placing authorization at the entity level, with deny-by-default, mirrors DDD's protection of invariants.
- **Domain as bounded context** — The `domain()` with `exports`/`inject` model correctly represents Bounded Context boundaries and explicit APIs between contexts.

---

## Concerns

### 1. No Aggregate Pattern — Transactional Boundaries Are Implicit

**Problem:** The design explicitly rejects Aggregates ("We don't need the Aggregate pattern because the framework enforces consistency declaratively"). This is optimistic.

In classical DDD, Aggregates define **transactional consistency boundaries**—the guarantee that all invariants within the Aggregate hold after every operation. The framework cannot know which entities must change atomically to satisfy business rules. For example: "an Order must have at least one LineItem" or "a Customer cannot have more than 3 overdue Invoices."

**Recommendation:** Introduce a lightweight Aggregate concept—not a class, but a declaration:

```typescript
const orderAggregate = aggregate('orders', {
  root: ordersEntity,
  entities: [ordersEntity, lineItemsEntity],
  invariants: {
    mustHaveLineItems: (order) => order.lineItems.length > 0,
    totalMatchesSum: (order) => order.total === sum(order.lineItems.map(li => li.price)),
  }
})
```

Without this, developers will rely on `service()` to coordinate multi-entity transactions, but there's no enforced boundary—making it easy to violate invariants across entities that should be atomic.

### 2. Hooks ≠ Domain Events — Coupling and Timing Issues

**Problem:** The `on` reactions are synchronous, co-located hooks that execute within the same transaction as the mutation. This differs fundamentally from DDD Domain Events, which are:

- **Decoupled** — published to an event bus, not executed inline
- **Asynchronous** (typically) — allowing eventual consistency
- **Immutable records** — representing "something that happened"

The current design cannot support:
- Event sourcing (storing event history)
- Multiple independent reaction handlers (e.g., "notify user" + "update analytics" + "trigger webhook")
- Eventual consistency across services
- Reliable delivery guarantees

**Recommendation:** Acknowledge this as a v1 limitation and prioritize a true Domain Event system for v2. Document the distinction clearly so developers don't assume EDA hooks provide event-driven architecture.

### 3. No Saga Pattern — Distributed Transactions Unaddressed

**Problem:** When a `domain()` is deployed as a microservice, cross-entity operations become distributed transactions. The design mentions auto-generated RPC but doesn't address failure modes.

**Recommendation:** Add guidance on Saga pattern (choreography or orchestration) for cross-domain operations, or document that distributed transactions are out of scope for v1.

### 4. Specification Pattern Absent

**Problem:** Complex query logic (e.g., "find all active orders created in the last 30 days with total > $100") is typically expressed via the Specification pattern in DDD. The design relies on inline lambda functions in `where` clauses.

**Recommendation:** While not critical, consider a `specifications/` directory convention for reusable query logic, especially for complex business rules that recur across queries.

### 5. Value Objects Are Under-emphasized

**Problem:** Schema types (`s.object()`, etc.) are mapped to Value Objects correctly, but the design gives them minimal attention. There's no discussion of:
- Immutable semantics
- Equality by attribute rather than identity
- Rich Value Object behavior

**Recommendation:** Add a section emphasizing that schema types are true Value Objects and documenting conventions for behavior-rich Value Objects (e.g., `Money` with `add()`, `subtract()`, `multiply()` methods).

---

## Missing Patterns Worth Considering

1. **Domain Events** (v2 priority, as noted) — Full event bus with persistence, not just hooks
2. **Aggregate** — Explicit transactional boundaries with invariant enforcement
3. **Specification** — Reusable, composable query logic
4. **Saga** — Distributed transaction coordination between domains
5. **Domain Primitive** — A Value Object with built-in validation (c.f. Vernon, "Redefining")

---

## Verdict: Approve with Changes

The design is sound for v1. The declarative model is the right trade-off for most applications, and the DDD concepts are correctly understood. However, the concerns above represent gaps that will cause pain at scale:

- **Aggregate**: Add at least a declaration mechanism, even if implementation is framework-assisted
- **Domain Events**: Rename or clearly document the limitation of `on` hooks vs true events
- **Saga**: Document out-of-scope or add basic support

These changes would make EDA a more honest and robust DDD implementation without sacrificing its declarative elegance.

---

*Word count: ~720*
