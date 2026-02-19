# Devil's Advocate Review: Result Boundaries v3

**Reviewer:** Devil's Advocate (v3)  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md` (v3)  
**Context:** Follow-up to v2 review

---

## Executive Summary

v3 makes real progress on several v2 concerns — most notably shipping `pipe()` from day one and explicitly rejecting the interface→class migration. However, it introduces a new risk (code-based HTTP mapping) that deserves scrutiny, and the core simplicity claim remains questionable. The doc still avoids the industry comparison question entirely.

---

## 1. Were v2 Concerns Addressed?

### 1.1 5-Change Complexity — PARTIALLY ADDRESSED

**v2 Claim:** The design required 5 distinct changes (AppError httpStatus, VertzException hierarchy, server detection, DB class migration, two Result types).

**v3 Treatment:** v3 does consolidate some of this:
- No more mention of interface→class migration (explicitly rejected)
- `@vertz/errors` Result is now the primary (vs. two competing types)
- The server boundary logic is clearer

**But the count hasn't shrunk much:**
- Phase 3: Add `httpStatusForError()` + `HTTP_STATUS_MAP`
- Phase 4: Add `pipe()`
- Phase 5: Server boundary detection
- Phase 6: `@vertz/schema` parse() → Result
- Phase 7: `@vertz/db` CRUD → Result variants

That's still **5 phases (3-7)** for core functionality. The doc claims "fewer changes" but doesn't quantify this honestly.

**Verdict:** PARTIALLY ADDRESSED. Better organized, but the complexity hasn't meaningfully decreased.

---

### 1.2 Two Result Types Footgun — PARTIALLY ADDRESSED

**v2 Claim:** Developers would import wrong Result type, causing subtle bugs.

**v3 Treatment:** 
> "@vertz/core Result stays temporarily for backward compatibility but is **deprecated**."

This is better — one type is clearly primary. But:
- The type signatures are still identical (`{ ok: true; data: T } | { ok: false; error: E }`)
- During the deprecation period, both still exist
- The runtime detection logic in the server boundary still needs to disambiguate

**Verdict:** PARTIALLY ADDRESSED. Better direction, but the footgun still exists during migration.

---

### 1.3 Interface→Class Burial — FULLY ADDRESSED ✓

**v2 Claim:** The migration from interfaces to classes was buried and massive.

**v3 Treatment:**
> "Decision 2: Errors Stay as Plain Objects... We do NOT migrate interfaces to classes."

This is explicit and correct. The doc now argues for plain objects as a **design decision**, not a migration target.

**Verdict:** FULLY ADDRESSED.

---

### 1.4 pipe() Deferred — FULLY ADDRESSED ✓

**v2 Claim:** `pipe()` should ship day one, not "when painful."

**v3 Treatment:**
> "Decision 5: Ship `pipe()` From Day One"

The doc now includes full `pipe()` design with usage examples. This was a key v2 criticism and is addressed.

**Verdict:** FULLY ADDRESSED.

---

### 1.5 Industry Comparison Missing — NOT ADDRESSED ❌

**v2 Claim:** Need real comparison with tRPC, Remix, Hono.

**v3 Treatment:** Still absent. The doc mentions:
- "Go (`if err != nil`), Rust (`?`), Effect-TS"
- "tRPC/Remix/Hono use throw-based models"

But it doesn't explain **why Vertz is choosing a pattern no major TypeScript framework uses**.

**Verdict:** NOT ADDRESSED. Still a gap.

---

## 2. Is v3 Actually Simpler? (Counting the Changes)

The doc claims v3 is simpler than v2. Let's count what's actually needed:

### Minimum Viable Implementation (non-breaking)

| Phase | Change | Complexity |
|-------|--------|------------|
| 3 | Add `httpStatusForError()` + `HTTP_STATUS_MAP` to `@vertz/errors` | ~1 file |
| 4 | Add `pipe()` to `@vertz/errors` | ~1 file + tests |
| 5 | Server boundary detects `@vertz/errors` Result, uses `httpStatusForError()` | app-runner.ts |

**That's 3 changes** for basic functionality.

### Full Migration (breaking)

| Phase | Change | Complexity |
|-------|--------|------------|
| 6 | `@vertz/schema` — `parse()` → Result, `assert()` → throw | API change |
| 7 | `@vertz/db` CRUD — add Result-returning variants | Additive |
| 8 | Deprecate `@vertz/core` Result | Cleanup |
| 9 | Remove inline duplicates | Cleanup |

**That's 9 phases total.**

### Comparison

**v2 claimed:** 5 changes for auto-mapping  
**v3 actually:** 3 changes for MVP, 9 phases total

The doc is being slippery with "fewer changes." It's accurate that the **immediate** work is smaller (3 phases vs. 5), but the full migration is still a multi-phase undertaking.

**Verdict:** The simplicity claim is **partially honest**. MVP is simpler, but full migration isn't dramatically simpler than v2's plan.

---

## 3. The Code-Based Map is a New Risk

v3 introduces a centralized `HTTP_STATUS_MAP`:

```typescript
export const HTTP_STATUS_MAP: Record<string, number> = {
  'NOT_FOUND': 404,
  'UNIQUE_VIOLATION': 409,
  // ...
};
```

### Risk 1: Unmapped Codes → Silent 500

```typescript
// Developer creates a custom error
const error = createError('CUSTOM_ERROR', 'Something went wrong');

// At server boundary:
const status = HTTP_STATUS_MAP[error.code] ?? 500; // Silent 500!
```

The developer expects something (maybe 400?), but gets 500 with no warning. There's no validation that all created error codes are in the map.

### Risk 2: Code Collision Across Domains

What if two domains use the same code with different intended HTTP statuses?

```typescript
// In payments domain:
createError('NOT_FOUND', 'Payment not found'); // Intends 404

// In notifications domain:  
createError('NOT_FOUND', 'Notification not found'); // Also 404, OK

// But what about:
createError('INVALID_STATE', 'Cannot process'); // Payments wants 422, notifications wants 400
```

The map forces a single HTTP status per error code. If different domains have different semantics for the same code, someone loses.

### Risk 3: No Compile-Time Safety

```typescript
// Refactor: rename error code
// Old: 'NOT_FOUND' → 404
// New: 'RESOURCE_NOT_FOUND' → 404

// But HTTP_STATUS_MAP still has 'NOT_FOUND'!
// Old code creating errors now gets wrong status (or 500 if code changed)
```

**Mitigation the doc doesn't discuss:**
- Linting rules to enforce all codes in map?
- Codegen to extract codes from error factories?
- Runtime validation on startup?

**Verdict:** This is a **real risk** that deserves acknowledgment. The map is centralized but not enforced.

---

## 4. Plain Objects vs Classes — Is This the Right Call?

v3 explicitly rejects classes:

> "Plain objects serialize naturally to JSON... Factory functions... Type guards work via `code` discriminant... LLMs understand plain objects better..."

### The Counter-Argument the Doc Doesn't Address

**Plain objects can't have methods:**

```typescript
// With classes, you can do:
class NotFoundError extends AppError<'NOT_FOUND'> {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404);
  }
  
  toResponse(): Response {
    return json({ error: this.code, message: this.message }, this.statusCode);
  }
  
  toJSON() {
    return { 
      code: this.code, 
      message: this.message,
      resource: this.resource,  // Extra field!
      id: this.id
    };
  }
}

// With plain objects, you can't:
const error = createNotFoundError('users', '123');
// error.toResponse is undefined
```

**The doc's response** is to use a separate function:
```typescript
return match(result, {
  ok: (data) => ctx.json(data, 200),
  err: (error) => ctx.json(error, httpStatusForError(error)),
});
```

But this requires importing `match` and `httpStatusForError` at every route handler that needs custom handling. With classes, the error **knows how to convert itself**.

### The Real Trade-off

| Aspect | Plain Objects | Classes |
|--------|---------------|---------|
| Serialization | Native | Need `toJSON()` |
| Self-conversion | Need separate function | `error.toResponse()` |
| LLM understanding | Claim: better | Unknown |
| Type guards | Via `code` discriminant | Via `instanceof` |
| Package boundary | Fragile (`instanceof`) | Also fragile |

The doc is likely **correct** that plain objects are simpler for Vertz's use case. But the argument is one-sided — it doesn't acknowledge what you're giving up.

**Verdict:** The decision is **reasonable but under-defended**. The doc should acknowledge the method tradeoff.

---

## 5. Sections 10 and 11 — Fair Arguments?

### Section 10: Why Not Throw?

The doc argues:
1. **No type safety on throws** — TypeScript doesn't know what a function throws
2. **Composition requires try/catch** — Nested services → nested catches
3. **LLM-unfriendly** — Can't determine error handling from signature
4. **Industry trajectory** — Go, Rust, Effect-TS point toward errors-as-values

**Assessment:**

Points 1-3 are **valid** but overstated:
- JSDoc `@throws` exists
- Most services fail at ONE point, not nested
- LLMs adapt to any pattern they're trained on

Point 4 is the **real argument**:
> "We're betting on where the language is heading."

This is a **speculation-based design decision**. The TC39 safe-assignment proposal (`?=`) is Stage 1. It's not TypeScript. There's no timeline.

**The doc doesn't address:**
- Every major TypeScript framework uses throw (tRPC, Remix, Hono, Next.js, Fastify)
- These frameworks are production-proven at massive scale
- The "bet" might be wrong

### Section 11: Why Not Hybrid?

The doc argues:
1. **Conversion layer is boilerplate** — Every top-level method: `if (!result.ok) throw result.error`
2. **Two mental models** — Internal returns Result, top-level throws
3. **Auto-mapping eliminates motivation** — Route handlers "don't need to deal with Result"

**Assessment:**

Points 1-2 are **fair**. The hybrid does introduce a conversion pattern.

**Point 3 is the weak spot:**

> "With `httpStatusForError()` auto-mapping, route handlers just return the Result — no dealing needed."

But the doc **immediately shows the opt-out case:**
```typescript
route.post('/orders', async (ctx) => {
  return match(result, {
    ok: (order) => ctx.json(order, 201),  // Custom 201!
    err: (error) => ctx.json(error, httpStatusForError(error)),
  });
});
```

This is **not simpler** than:
```typescript
try {
  return ctx.json(await createOrder(ctx.body, ctx), 201);
} catch (e) {
  return mapToHttp(e);
}
```

The "90% simple" argument only works for the 90% that don't need custom HTTP status. For the other 10%, you're back to explicit handling.

**Verdict:** The arguments are **partially fair, partially strawman**. The throw dismissal undersells the ecosystem's experience. The hybrid dismissal overstates auto-mapping benefits.

---

## 6. Industry Comparison — STILL NOT THERE

The doc still doesn't name a production TypeScript framework that uses:
- Result-based error handling
- Plain objects (not classes)
- Code-based HTTP status mapping
- Auto-mapping at the server boundary

**What exists:**

| Framework | Model | TypeScript Support | Result + Auto-Map |
|-----------|-------|-------------------|-------------------|
| tRPC | Throw (TRPCError) | ✅ Typed throws | ❌ |
| Remix | Throw (Response) | ✅ | ❌ |
| Hono | Throw (HTTPException) | ✅ | ❌ |
| Fastify | Throw | ✅ | ❌ |
| NestJS | Throw + filters | ✅ | ❌ |
| Effect-TS | Either/Effect | ✅ Native | ✅ But no HTTP |

**The honest answer:** No major production framework uses this exact pattern. Vertz is proposing something genuinely novel — but the doc doesn't have the courage to say "we're pioneering this" or explain the risk.

**Verdict:** STILL MISSING. The doc should either:
1. Name a framework that does this (it can't)
2. Acknowledge this is novel/experimental

---

## 7. Is This Design Novel or Just Complicated?

### What the Design Actually Is

A centralized error code → HTTP status map:
```typescript
const HTTP_STATUS_MAP = {
  'NOT_FOUND': 404,
  'VALIDATION_FAILED': 400,
  // ...
};
```

This is **exactly what Express/Fastify middleware does** with `error.statusCode`:
```typescript
// Express:
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json(err);
});
```

### What's Added

Result on top:
```typescript
// Services return:
{ ok: false, error: { code: 'NOT_FOUND', ... } }

// Server detects Result, looks up code in map, returns HTTP
```

### What's the Improvement?

The doc doesn't clearly answer this. Best I can tell:

1. **Explicit error types in signatures** — `Result<User, NotFoundError | ValidationError>`
2. **Composable services** — `pipe()` chains without try/catch
3. **Structured domain errors** — Not just HTTP codes

### What's the Cost?

1. **New pattern** — No framework uses exactly this
2. **Boilerplate** — Even with `pipe()`, more lines than throw
3. **Map maintenance** — New error codes must be added to map
4. **Migration** — 9 phases to get there

**The honest comparison:**

| Approach | Complexity | Industry Proven |
|----------|------------|-----------------|
| Throw + VertzException | Low | ✅ Every framework |
| Result + HTTP map | High | ❌ Novel |

**Verdict:** The design is **genuinely novel** but not clearly **better**. It's more complicated with no proven advantage. The doc should be more honest about this trade-off.

---

## 8. Additional Concerns

### 8.1 Error Union Growth Still Hand-Wavy

> "If a union grows beyond ~5 error types, decompose the service."

This is vague. Real business operations often need 6-8 error types:
- `refundOrder` → NotFound + AlreadyRefunded + InsufficientInventory + PaymentFailed + NotificationFailed

That's 5 already. Is this "doing too much"?

### 8.2 The "LLM-Friendly" Claim is Still Untested

The doc repeats:
> "LLM-friendly — AI agents get this right on the first prompt"

This is **faith**, not evidence. LLMs are trained on throw-based JavaScript. Claiming Result is "better for LLMs" without evidence is speculation.

### 8.3 No Escape Hatch for Gradual Migration

What if a team wants to try Result in one service only? The doc doesn't provide:
- `tryCatch()` helper to convert throws to Result
- Guidelines for partial migration
- "Breaking the rules" documentation

---

## 9. What v3 Does Better (Acknowledging Progress)

Credit where due:

1. **pipe() ships day one** — Was the biggest v2 criticism, now addressed
2. **Explicitly rejects class migration** — No more buried massive change
3. **Clearer migration phases** — 9 phases with clear scope
4. **HTTP_STATUS_MAP is testable** — One centralized object, easy to verify
5. **match() helper for custom responses** — Addresses the 10% case
6. **Keeps backward compat** — getOrThrow(), existing throwing methods

---

## 10. Verdict

### What v3 Gets Right

1. `pipe()` from day one
2. No interface→class migration
3. Clearer migration organization
4. Centralized, testable HTTP map
5. Acknowledging the debate positions

### What v3 Gets Wrong

1. **Claiming "simpler" is dishonest** — Still 9 phases, still complex
2. **Code-based map has real risks** — Unmapped codes, collisions, no enforcement
3. **Industry comparison still missing** — Can't name a single framework
4. **Sections 10-11 arguments are weak** — Overstates benefits, undersells throw ecosystem
5. **Novelty vs. complexity trade-off not acknowledged** — This might not be better, just different
6. **Plain object trade-offs one-sided** — Doesn't acknowledge what methods would provide

### The Core Question

The doc asks us to believe Result + HTTP map is simpler than throw. But:

- **Throw**: Services throw, server catches and maps (standard pattern, every framework)
- **Result**: Services return Result, server detects type, looks up code in map, returns HTTP (novel, unproven)

Where is the simplification? The "boilerplate" argument applies to Result too — you still need `pipe()` or explicit unwrapping.

**Recommendation:** The team should be more honest about what this design gains. It's not clearly simpler or better — it's different. The industry hasn't adopted this pattern for a reason.

---

*Review by Devil's Advocate v3 — still finding holes, but progress noted*
