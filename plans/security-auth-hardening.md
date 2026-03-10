# Design Doc: Security Auth Hardening

**Status:** Draft
**Author:** mike
**Feature:** Security Auth Hardening

## 1. API Surface

### 1.1 Public sign-up cannot self-assign framework-owned privileges

```ts
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
});

await auth.api.signUp({
  email: 'user@example.com',
  password: 'Password123!',
  role: 'admin',
  plan: 'enterprise',
  emailVerified: true,
});
```

After this change:

- `role` is not accepted as a public sign-up control field
- `plan` and `emailVerified` are stripped from public sign-up input
- framework-managed identity fields (`id`, `createdAt`, `updatedAt`) remain stripped
- extra non-reserved profile fields still pass through unchanged

Resulting user shape:

```ts
{
  id: 'generated',
  email: 'user@example.com',
  role: 'user',
  emailVerified: false,
}
```

### 1.2 Session revocation is enforced at read time

`getSession()` and the auth middleware stop trusting a valid JWT by itself. A session is authenticated only when:

1. the JWT signature and expiry are valid
2. the backing session record still exists, is not revoked, and is not expired
3. the session belongs to the JWT subject

Effects:

- `signOut()` invalidates the current session immediately
- `DELETE /sessions/:id` invalidates that session immediately
- `DELETE /sessions` invalidates revoked sessions immediately
- password reset session revocation invalidates existing access JWTs immediately

### 1.3 `/api/auth/access-set` stays revalidatable but becomes private

The endpoint keeps `ETag` support, but it must no longer look shared-cacheable.

New response policy:

- `Cache-Control: private, no-cache`
- `Vary: Cookie`
- `ETag` retained

This preserves browser revalidation while preventing intermediary cross-user cache reuse.

### 1.4 Forgot-password hides account existence in both body and timing

The route already returns `200` for both existing and missing users. It will now also reduce timing disclosure by:

- moving `onSend()` off the request hot path
- applying a minimum response floor to the endpoint
- doing equivalent token generation and hashing work on both branches

The route remains intentionally silent about email delivery failures.

### 1.5 Auth JSON parsing uses bounded body reads

All auth JSON/form routes will use the same bounded body parser as the framework runtime. The parser no longer trusts `Content-Length` as the only enforcement mechanism; it stops reading once the configured byte limit is exceeded.

## 2. Manifesto Alignment

**Security over everything:** This is a direct Zeroth Law fix set. The current behavior allows privilege injection, delayed revocation, and user-specific cache ambiguity.

**Compile-time over runtime where possible:** The `role` sign-up field is removed from the public input type so the compiler stops advertising a privileged control that should never be user-driven.

**Explicit over implicit:** Session validity becomes explicit: JWT validity is necessary but not sufficient. Cache headers also become explicit about privacy.

**LLM-first:** The current `role?: string` type is a trap for agents and humans. Removing it and codifying reserved-field stripping makes the API harder to misuse on the first try.

## 3. Non-Goals

- Introducing a general sign-up field allowlist for arbitrary custom user-store fields
- Reworking refresh-token rotation semantics beyond immediate revocation enforcement
- Changing OAuth provider semantics in this pass
- Adding queue infrastructure for email delivery
- Redesigning the auth cookie names or paths

## 4. Unknowns

No unknowns identified. The fixes are localized and the failure modes are already reproduced from the audit.

## 5. POC Results

No POC required.

## 6. Type Flow Map

No new generic type flow is introduced by this feature.

Type-level acceptance still matters for the public auth API:

```txt
SignUpInput -> createAuth().api.signUp() -> caller compile-time surface
```

Acceptance criterion:

- `SignUpInput` no longer advertises `role`

## 7. E2E Acceptance Tests

1. Public sign-up with `{ role: 'admin', plan: 'enterprise', emailVerified: true }` creates a user with `role: 'user'`, no elevated plan, and normal verification state.
2. After `signOut()`, `getSession()` with the old JWT returns `null`.
3. After `DELETE /sessions/:id`, `GET /session` with that JWT returns `null`.
4. After password reset with `revokeSessionsOnReset`, old session JWTs stop authenticating immediately.
5. `GET /api/auth/access-set` returns `Cache-Control: private, no-cache`, `Vary: Cookie`, and still honors `If-None-Match`.
6. `POST /api/auth/forgot-password` stays `200` for existing and missing users and no longer awaits the delivery callback.
7. Oversized auth JSON bodies are rejected with `400` before the full payload is consumed.
