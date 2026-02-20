# Entity Store Review — Devil's Advocate

## Verdict: Approve with Changes

## Summary

The design is architecturally sound and addresses Apollo's pain points well, but has significant production readiness gaps around memory scaling with large entity counts, SSR store isolation enforcement, and missing field-level access control in the client store. These require clarification before implementation.

## Strengths

- Compiler-generated normalization eliminates Apollo's runtime type guessing (Section 6)
- Signal-per-entity with computed selectors provides fine-grained reactivity without per-field signal overhead (Section 10.7)
- Single update path unifies fetch, optimistic, real-time, and SSR (Section 5)
- Field-level merge with diff detection prevents unnecessary re-renders (Section 3.4)
- Dead field detection and select narrowing suggestions show thoughtful optimization (Section 6.4)

## Concerns

1. **Memory scaling with large entity counts** — **Critical**
   - Section 10.7 generates computed selectors per-field-per-component. With 10,000 entities and 100 active queries, memory could explode.
   - No virtualization strategy for large lists stored in the normalized store.
   - Recommendation: Add entity pagination/virtualization at store level, or cap active entity signals.

2. **SSR store isolation not enforced** — **Critical**
   - Section 14.1 recommends "per-request on server" but doesn't specify enforcement mechanism.
   - If two concurrent SSR requests share a store instance, Request A could see Request B's data.
   - Recommendation: The framework must create a new store instance per request, not just recommend it.

3. **Client store can expose restricted fields** — **Major**
   - Section 3.4 mentions `.readOnly()` and `.hidden()` annotations but doesn't specify how they're applied during merge.
   - If API returns fields the user shouldn't see, they enter the client store.
   - Recommendation: Filter fields during normalization based on access rules, not just annotations.

4. **Dynamic access triggers full fetch** — **Major**
   - Section 10.4: `user.data[field]` falls back to fetching all public fields.
   - Common patterns (forms, dynamic tables) could trigger excessive fetching.
   - Recommendation: Provide a way to explicitly declare accessible fields for dynamic access patterns.

5. **No updatedAt, no tie-breaker** — **Major**
   - Section 14.5 says use `updatedAt` as tie-breaker, but what if entities don't have it?
   - Falls back to last-write-wins with no warning.
   - Recommendation: Make `updatedAt` required for entities used with real-time, or document the fallback behavior.

6. **Cross-component tracing gaps** — **Minor**
   - Section 10.5 traces through props but doesn't address context or global state outside the store.
   - Entities passed via React Context won't trigger trace updates.
   - Recommendation: Document this limitation or extend tracing to context.

7. **Bundle size unspecified** — **Minor**
   - Section 6 generates normalize/denormalize/merge per entity. No estimate for 50 entities.
   - Recommendation: Provide bundle size estimates in the spec.

8. **Polymorphic/union types unaddressed** — **Minor**
   - No guidance on handling entities with union types or polymorphic relations.
   - Composite keys (e.g., `OrderItem: orderId + productId`) not mentioned.
   - Recommendation: Add to open questions or specify as out of scope.

## Recommendations

1. Add explicit SSR store lifecycle management with isolation verification.
2. Implement field-level filtering in normalizers based on access rules.
3. Document memory management strategy for 10K+ entity scenarios.
4. Make `updatedAt` or explicit ordering field required for real-time-enabled entities.
5. Extend cross-component tracing to React Context patterns.
6. Provide bundle size benchmarks for the generated normalizers.
