# Design Review: Content Descriptors for Service Actions

- **Author:** viniciusdacal
- **Reviewer:** adversarial-agent
- **Date:** 2026-03-10

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] Manifesto alignment (one way to do things, explicit over implicit)
- [x] Public API matches vision (LLM-first, no ceilings)
- [x] Examples are factually correct (fixed SAML ACS — uses form-urlencoded, not XML)
- [x] Type flow verified (body omission → unknown, which is safe)

## Findings

### Blockers

#### 1. SAML ACS example is factually wrong

SAML ACS endpoints receive `application/x-www-form-urlencoded` (browser form POST with `SAMLResponse` field), NOT `application/xml`. The Example 2 showing `body: content.xml()` for ACS doesn't match real SAML.

**Resolution:** Fix the example. `parseBody()` already handles form-urlencoded → object. The ACS handler can use `s.object({ SAMLResponse: s.string() })` for the form input and `content.html()` for the auto-submit form response. This actually demonstrates mixed content types (form-urlencoded in, HTML out) which is a stronger example.

#### 2. Type inference for omitted `body` claimed as `undefined` — actually `unknown`

The design claims `TInput` defaults to `undefined` when body is omitted. In reality, `TInput` stays at the default `unknown`. However, `unknown` is actually the correct and safe type — TypeScript prevents property access on `unknown`, so developers can't accidentally use the input without narrowing.

**Resolution:** Change the claim from `undefined` to `unknown`. Note that `unknown` is safe (prevents accidental access). No conditional types or overloads needed.

#### 3. Route generator crashes when `body` is omitted

`handlerDef.body.parse(rawBody)` is called unconditionally (line 114). When `body` is `undefined`, this is `undefined.parse()`. Phase 3 makes body optional in types but Phase 4 fixes the route generator — broken window between phases.

**Resolution:** Phase 3 must include the `if (handlerDef.body)` guard in the route generator as part of making body optional. Phase 4 adds the content-type aware behavior on top.

### Should-Fix

#### 4. `content.formData()` examples are misleading

Example 4 shows a fully fleshed-out `content.formData()` example but formData is explicitly deferred as a non-goal. Confusing for readers.

**Resolution:** Move formData example to Future Work section with a clear "Phase 2" label.

#### 5. Content-type mismatch behavior unspecified

What happens when `body: content.xml()` receives `application/json`? Should be 415 Unsupported Media Type.

**Resolution:** Add content-type validation to content descriptors. The descriptor's `parse()` can check the content type and return `{ ok: false }` with a mismatch error. The route generator returns 415.

#### 6. `content.binary().parse()` behavior unspecified

What types does it accept? `Uint8Array`? `ArrayBuffer`?

**Resolution:** Spec it: accepts `Uint8Array`, returns `{ ok: true, data: Uint8Array }`. Add to Phase 1 acceptance criteria.

#### 7. Binary response serialization path

Can't `JSON.stringify` a `Uint8Array`. The route generator needs a distinct code path for binary.

**Resolution:** Add explicit callout: binary descriptors pass the `Uint8Array` directly to `new Response(body)`. Add test in Phase 4.

#### 8. `ctx.request` data flow not traced

`createServiceContext` currently takes `requestInfo` (userId/tenantId/roles). Adding `request` (url/method/headers/body) requires a new parameter and the route generator must extract it from `ctx.raw`.

**Resolution:** Trace the path in Phase 5: route handler extracts from `ctx.raw` → passes to `createServiceContext` → exposed as `ctx.request`.

#### 9. Response validation for content descriptors

Should content descriptors call `parse()` on the response for validation? `content.xml().parse(result)` checks `typeof result === 'string'` which catches handler bugs (returning object instead of string).

**Resolution:** Keep response validation for content descriptors — call `parse()` on handler return to verify type. This catches bugs without overhead.

### Nice-to-Haves

10. `'5mb'` size string format should be documented precisely.
11. `application/x-www-form-urlencoded` already handled by core — mention in non-goals or note that `s.object()` works for it naturally.
12. Phase 3 + 4 ordering constraint noted (resolved by including guard in Phase 3).

## Resolution

All blockers and should-fix items addressed in design doc revision:

1. **SAML ACS example fixed** — Example 2 now shows HTML response (IdP SSO). Example 3 shows form-urlencoded input with `s.object()` for SP ACS. `application/x-www-form-urlencoded` added to non-goals (already handled by core).
2. **Type inference corrected** — Changed `undefined` to `unknown` throughout. Added explanation of why `unknown` is safe.
3. **Phase 3 ordering fixed** — Phase 3 now explicitly includes the route generator `if (handlerDef.body)` guard alongside the type change.
4. **formData examples moved** — Removed from main API Surface, moved to Future Work with code example.
5. **415 content-type mismatch** — New "Content-type mismatch behavior" section added with behavior table.
6. **binary parse behavior** — Parse table added specifying `Uint8Array` input, rejects `string`/`ArrayBuffer`.
7. **Binary response serialization** — Route generator table updated: binary passes bytes directly to `new Response()`.
8. **ctx.request data flow traced** — Added explicit flow: `ctx.raw` → route handler → `createServiceContext()` → `ctx.request`.
9. **Response validation kept** — Added note: content descriptor `parse()` always runs on response (type guard, not structural validation).

## Verdict

**Approved** — All findings addressed. Design ready for implementation.
