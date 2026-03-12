# OAuth Profile Mapping — Flexible Provider-to-User Transform

**Issue:** TBD
**Status:** Design Discussion
**Date:** 2026-03-11
**Related:** Linear Clone Phase 0 (`plans/linear-clone-auth.md`) — unblocked by existing 2-line fix, this design replaces the fix with a proper framework primitive.

## Problem

The OAuth callback handler in `createAuth()` creates users with a fixed shape, discarding provider-specific data:

```typescript
// packages/server/src/auth/index.ts line ~1358
const newUser: AuthUser = {
  id: crypto.randomUUID(),
  email: userInfo.email.toLowerCase(),
  role: 'user',
  createdAt: now,
  updatedAt: now,
};
// userInfo.name, userInfo.avatarUrl — silently discarded
// GitHub login, bio, company — never even reached this point
```

The `OAuthUserInfo` type returned by providers is also a fixed 5-field shape. GitHub returns 30+ fields (login, bio, company, location, etc.) — all lost after the provider's `getUserInfo` normalizes them.

This means:
- Apps can't store provider-specific data (GitHub username, Google locale, Discord discriminator)
- Adding a new field to the user model requires a framework change
- The framework makes assumptions about what the app's user table looks like

A 2-line fix was applied to pass `name` and `avatarUrl` through, unblocking the Linear clone. This design replaces that stopgap with a proper extensible mapping layer.

## Ecosystem Research

Studied 4 auth libraries (Auth.js, Better Auth, Lucia, Supabase, Clerk). Common patterns:

| Pattern | Auth.js | Better Auth | Lucia | Supabase | Clerk |
|---------|---------|-------------|-------|----------|-------|
| Typed `profile()` transform | `profile(raw) → UserFields` | `mapProfileToUser(profile) → fields` | N/A (manual) | N/A (JSONB dump) | Dashboard mapping |
| Raw data preserved | No (unless custom adapter) | Yes (`data: profile`) | Your choice | Yes (`identity_data` JSONB) | Yes (ExternalAccount) |
| User schema extensible | Via adapter | `additionalFields` | You own the table | Separate `profiles` table | 3-tier metadata |
| Per-provider typing | Yes (provider generics) | Yes (`ProviderOptions<Profile>`) | N/A | No | No |

**Best practice:** A per-provider `mapProfile` callback that receives typed raw data and returns fields to spread onto the user. The framework provides sensible defaults but the app controls the mapping.

---

## 1. API Surface

### 1.1 Per-Provider `mapProfile` Callback

Each provider config gains an optional `mapProfile` function. It receives the **typed raw profile** from that provider and returns fields to spread onto the `AuthUser` being created.

```typescript
import { github } from '@vertz/server/auth/providers';

github({
  clientId: '...',
  clientSecret: '...',
  // Typed — profile is GithubProfile with autocomplete for all 30+ fields
  mapProfile: (profile) => ({
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
    // App-specific fields — goes onto AuthUser via [key: string]: unknown
    githubUsername: profile.login,
    bio: profile.bio,
    company: profile.company,
  }),
});
```

If `mapProfile` is not provided, the provider uses a **built-in default mapping**. Every built-in provider always has a `mapProfile` function — the developer's custom one replaces it, not supplements it.

```typescript
// Default for GitHub (internal to the provider factory)
const defaultMapProfile = (profile: GithubProfile) => ({
  name: profile.name ?? profile.login,
  avatarUrl: profile.avatar_url,
});
```

### 1.2 Provider Types

Each provider exports its raw profile type for external use:

```typescript
// @vertz/server/auth/providers
export type { GithubProfile } from './providers/github';
export type { GoogleProfile } from './providers/google';
export type { DiscordProfile } from './providers/discord';
```

**Note on Google:** The Google provider uses OIDC ID token claims, not a separate userinfo API call. `GoogleProfile` contains standard OIDC claims (`sub`, `email`, `email_verified`, `name`, `picture`, `given_name`, `family_name`, `locale`) — fewer fields than GitHub's 30+ field `/user` API response. The design doc's Google example only references fields available in the ID token.

### 1.3 Updated `OAuthUserInfo` — Includes Raw Data

```typescript
export interface OAuthUserInfo {
  providerId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>; // Full provider response — nothing lost
}
```

The `raw` field preserves the complete provider API response. Providers populate it from their API calls.

### 1.4 Updated Types

**Provider config — generic over profile type (developer-facing):**

```typescript
export interface OAuthProviderConfig<TProfile = Record<string, unknown>> {
  clientId: string;
  clientSecret: string;
  redirectUrl?: string;
  scopes?: string[];
  mapProfile?: (profile: TProfile) => Record<string, unknown>;
}
```

**Note:** This is a type-level breaking change to `OAuthProviderConfig` (adds generic parameter). Acceptable pre-v1 per breaking changes policy.

**Provider runtime object — used by the auth handler (type-erased):**

```typescript
export interface OAuthProvider {
  id: string;
  name: string;
  scopes: string[];
  trustEmail: boolean;
  getAuthorizationUrl: (state: string, codeChallenge?: string, nonce?: string) => string;
  exchangeCode: (code: string, codeVerifier?: string) => Promise<OAuthTokens>;
  getUserInfo: (accessToken: string, idToken?: string, nonce?: string) => Promise<OAuthUserInfo>;
  // NEW — profile mapping, always present (default or custom)
  mapProfile: (raw: Record<string, unknown>) => Record<string, unknown>;
}
```

The per-provider typing (`GithubProfile`) only exists at the config site where the developer writes `mapProfile`. Inside the provider factory, the typed callback is assigned to the `OAuthProvider.mapProfile` field, which is type-erased to `Record<string, unknown> => Record<string, unknown>`. This is safe — the developer gets autocomplete when writing the callback; the handler calls it opaquely.

### 1.5 Updated OAuth Callback Handler

The auth handler always calls `provider.mapProfile` — there is no fallback branch. Every provider (built-in or custom) must have a `mapProfile` function, either the default or developer-provided.

```typescript
// In createAuth() callback handler
const userInfo = await provider.getUserInfo(tokens.accessToken);
const mappedFields = provider.mapProfile(userInfo.raw);

// Framework-controlled fields override any mapping to prevent accidental overwrites
const newUser: AuthUser = {
  ...mappedFields,
  id: crypto.randomUUID(),
  email: userInfo.email.toLowerCase(),
  role: 'user',
  createdAt: now,
  updatedAt: now,
};
```

**Security: spread order.** `mappedFields` is spread FIRST, then framework-controlled fields (`id`, `email`, `role`, `createdAt`, `updatedAt`) override. This prevents `mapProfile` from accidentally or maliciously overwriting security-critical fields. A `mapProfile` that returns `{ role: 'admin' }` or `{ id: 'attacker-id' }` has no effect — the framework fields always win.

### 1.6 Full GitHub Example

```typescript
import { createAuth } from '@vertz/server';
import { github } from '@vertz/server/auth/providers';

// Minimal — uses default mapping (name + avatarUrl)
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '15m' },
  providers: [
    github({ clientId: '...', clientSecret: '...' }),
  ],
});

// Extended — app controls the mapping
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '15m' },
  providers: [
    github({
      clientId: '...',
      clientSecret: '...',
      mapProfile: (profile) => ({
        name: profile.name ?? profile.login,
        avatarUrl: profile.avatar_url,
        githubUsername: profile.login,
        bio: profile.bio,
        location: profile.location,
      }),
    }),
  ],
});
```

### 1.7 Google Example (Different Provider, Different Fields)

```typescript
import { google } from '@vertz/server/auth/providers';

// GoogleProfile contains OIDC standard claims from the ID token
google({
  clientId: '...',
  clientSecret: '...',
  mapProfile: (profile) => ({
    name: profile.name,
    avatarUrl: profile.picture,  // Google uses 'picture', not 'avatar_url'
    locale: profile.locale,
    givenName: profile.given_name,
    familyName: profile.family_name,
  }),
});
```

---

## 2. Manifesto Alignment

### Explicit over implicit

- No magic field mapping — the developer writes `mapProfile` to explicitly control what goes onto their user
- Default mapping is visible in provider source — not hidden behind abstractions
- Raw data preservation is automatic — the framework never silently drops data
- Security-critical fields can't be overwritten — spread order is explicit and documented

### Convention over configuration

- Zero-config works: no `mapProfile` → sensible defaults (name + avatarUrl)
- One-config upgrade: add `mapProfile` when you need more fields
- Same pattern across all providers — only the profile type changes

### Compile-time over runtime

- `mapProfile` is typed per-provider: `(profile: GithubProfile) => ...` gives autocomplete for all 30+ GitHub fields
- Type errors if you access a field that doesn't exist on that provider's profile

---

## 3. Non-Goals

- **No schema validation of mapped fields.** `mapProfile` returns `Record<string, unknown>`. The framework spreads it onto `AuthUser` without checking if the fields match the database schema. Schema validation is the database layer's job, not the auth layer's.
- **No cross-provider profile merging.** If a user signs in with GitHub and Google, each provider's `mapProfile` runs independently. There's no mechanism to merge fields from multiple providers into a unified profile. That's an app-level concern.
- **No raw profile storage.** The `raw` field on `OAuthUserInfo` flows through the callback handler but is not persisted to a dedicated column. If the app needs the full blob, they extract what they need via `mapProfile`. Storing arbitrary JSON on the user record is an app decision, not a framework default.
- **No UI for profile mapping.** Unlike Clerk's dashboard attribute mapping, this is code-only. Vertz is a code-first framework.
- **No `updateOnSignIn` in this scope.** Profile sync on returning sign-ins is a real feature but is deferred to a follow-up. See "Future: updateOnSignIn" section below. This design only covers user creation mapping.

---

## 4. Unknowns

### 4.1 Raw profile typing for generic OAuth providers

**Question:** For future custom/generic OAuth providers (not GitHub/Google/Discord), the raw profile type is `Record<string, unknown>`. This means `mapProfile` loses type safety for custom providers. Is this acceptable?

**Resolution strategy:** Discussion. Custom providers can define their own profile type:
```typescript
interface MyProviderProfile { ... }
genericOAuth<MyProviderProfile>({ mapProfile: (profile) => ... })
```
This is a future concern — the three built-in providers cover the immediate need.

### 4.2 `DbUserStore` only persists standard columns

**Question:** The built-in `DbUserStore` uses a hardcoded INSERT with columns: `id, email, password_hash, role, plan, email_verified, created_at, updated_at`. Custom fields from `mapProfile` (e.g., `githubUsername`, `bio`) will be on the `AuthUser` object but silently dropped by `DbUserStore.createUser`.

**Resolution:** This is by design. The built-in `DbUserStore` is the framework's minimal implementation for the `auth_users` table. Apps with custom fields have two options:
1. Provide a custom `UserStore` that handles additional columns.
2. Use the default stores for auth and sync custom fields to their own application `users` table via a post-auth hook (like the Linear clone does).

The design doc should document this clearly so developers don't see fields "work" in dev (InMemoryUserStore stores everything) and lose data in production (DbUserStore drops unknown columns).

---

## 5. POC Results

*N/A — straightforward implementation, no POC needed.*

---

## 6. Type Flow Map

```
Developer writes (typed):
  OAuthProviderConfig<GithubProfile> {
    mapProfile: (profile: GithubProfile) => { name, avatarUrl, githubUsername }
  }

Provider factory (type boundary):
  github(config) returns OAuthProvider {
    mapProfile: (raw: Record<string, unknown>) => Record<string, unknown>
    // Internally: config.mapProfile ?? defaultMapProfile
    // The GithubProfile generic is erased here — autocomplete was at the config site
  }

Provider runtime:
  provider.getUserInfo(accessToken)
    → fetch GitHub /user API → raw GithubProfile object
    → fetch GitHub /user/emails API → primary email
    → return OAuthUserInfo { providerId, email, emailVerified, name, avatarUrl, raw: GithubProfile }

Auth handler (callback):
  receive OAuthUserInfo from provider
    → mappedFields = provider.mapProfile(userInfo.raw)
    → newUser = { ...mappedFields, id, email, role, createdAt, updatedAt }
    → framework fields override mapped fields (security)
    → userStore.createUser(newUser, null)

Type safety chain:
  GithubProfile (30+ typed fields)
    → mapProfile callback autocomplete at config site ✓
    → returns Record<string, unknown> (erased at provider boundary)
    → spread onto AuthUser (which has [key: string]: unknown index)
    → UserStore.createUser receives full AuthUser
```

---

## 7. E2E Acceptance Test

```typescript
describe('Feature: OAuth profile mapping', () => {
  describe('Given a GitHub provider with default mapping (no mapProfile)', () => {
    describe('When a new user completes OAuth', () => {
      it('Then the created user has name and avatarUrl from GitHub profile', () => {});
    });
  });

  describe('Given a GitHub provider with custom mapProfile', () => {
    describe('When a new user completes OAuth', () => {
      it('Then the created user has all fields returned by mapProfile', () => {});
      it('Then provider-specific fields (githubUsername, bio) are on the user', () => {});
    });
  });

  describe('Given a mapProfile that returns { role: "admin" }', () => {
    describe('When a new user completes OAuth', () => {
      it('Then the user role is still "user" (framework field wins)', () => {});
    });
  });

  describe('Given the raw field on OAuthUserInfo', () => {
    describe('When a provider returns getUserInfo', () => {
      it('Then raw contains the full unprocessed provider API response', () => {});
    });
  });
});
```

---

## 8. Implementation Plan

### Phase 1: Provider Types + Raw Data Passthrough

**Goal:** Each provider returns typed raw data. `OAuthUserInfo.raw` is populated. No behavior change yet.

**Work:**
- Define `GithubProfile` type with all fields from GitHub's `/user` API (~30 fields)
- Define `GoogleProfile` type with OIDC standard claims from the ID token (`sub`, `email`, `email_verified`, `name`, `picture`, `given_name`, `family_name`, `locale`, `hd`)
- Define `DiscordProfile` type with all fields from Discord's `/users/@me` API
- Update each provider's `getUserInfo` to include `raw: profile` in the return
- Add `raw: Record<string, unknown>` to `OAuthUserInfo` type
- Export profile types from `@vertz/server/auth/providers`
- Update existing type tests (e.g., `types.test-d.ts`) for `OAuthUserInfo.raw`

**Acceptance criteria:**
```typescript
describe('Given the GitHub provider', () => {
  describe('When getUserInfo is called', () => {
    it('Then the result includes raw with the full GitHub API response', () => {});
    it('Then raw.login, raw.bio, raw.company are present', () => {});
  });
});

describe('Given the Google provider', () => {
  describe('When getUserInfo is called', () => {
    it('Then raw contains OIDC claims from the ID token', () => {});
    it('Then raw.given_name and raw.family_name are present', () => {});
  });
});
```

### Phase 2: mapProfile Callback + Default Mapping + Secure Spread

**Goal:** Providers accept `mapProfile`. The auth handler uses it when creating users. Default behavior preserved. Security-critical fields protected.

**Work:**
- Add `mapProfile` to `OAuthProviderConfig<TProfile>` (generic, developer-facing)
- Add `mapProfile` to `OAuthProvider` interface (type-erased, runtime)
- Each provider factory: use `config.mapProfile ?? defaultMapProfile` when building the `OAuthProvider`
- Define default `mapProfile` for each built-in provider:
  - GitHub: `{ name: profile.name ?? profile.login, avatarUrl: profile.avatar_url }`
  - Google: `{ name: profile.name, avatarUrl: profile.picture }`
  - Discord: `{ name: profile.global_name ?? profile.username, avatarUrl: <computed from avatar hash> }`
- Update auth handler: always call `provider.mapProfile(userInfo.raw)` — no fallback branch
- **Spread order:** `{ ...mappedFields, id, email, role, createdAt, updatedAt }` — framework fields win
- Remove the 2-line stopgap fix (replaced by default `mapProfile`)
- Update tests

**Acceptance criteria:**
```typescript
describe('Given a provider with custom mapProfile', () => {
  describe('When OAuth creates a new user', () => {
    it('Then the user includes all fields from mapProfile', () => {});
    it('Then fields NOT in mapProfile are NOT on the user', () => {});
  });
});

describe('Given a provider with default mapProfile', () => {
  describe('When OAuth creates a new user', () => {
    it('Then the user includes name and avatarUrl from default mapping', () => {});
  });
});

describe('Given a mapProfile that returns { id: "evil", role: "admin" }', () => {
  describe('When OAuth creates a new user', () => {
    it('Then the user id is a UUID (not "evil")', () => {});
    it('Then the user role is "user" (not "admin")', () => {});
  });
});
```

---

## 9. Migration & Backward Compatibility

- **`OAuthUserInfo.raw`** — new required field. Existing code that constructs `OAuthUserInfo` objects (tests, custom providers) must add `raw`. This is a breaking type change, acceptable pre-v1.
- **`OAuthProviderConfig<TProfile>`** — type-level breaking change (adds generic parameter). Existing code using `OAuthProviderConfig` in type annotations needs update. Acceptable pre-v1.
- **`OAuthProvider.mapProfile`** — new required field on the runtime interface. Existing custom `OAuthProvider` implementations must add it. Acceptable pre-v1.
- **Auth handler behavior** — when using built-in providers without `mapProfile`, behavior is identical to the current 2-line fix (name + avatarUrl pass through). Apps that don't customize see no change.

---

## 10. Future: updateOnSignIn (Deferred)

Profile sync on returning sign-ins — designed but deferred to a follow-up issue.

```typescript
github({
  clientId: '...',
  clientSecret: '...',
  updateOnSignIn: true,  // re-run mapProfile on every sign-in, update user
  mapProfile: (profile) => ({
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
  }),
});
```

**Implementation would require:**
- `updateOnSignIn` option on `OAuthProviderConfig`
- Optional `updateUser` on `UserStore` interface
- Throw at `createAuth()` init if `updateOnSignIn: true` but `userStore.updateUser` is not implemented (fail fast, not warn)
- Auth handler calls `updateUser` for existing users on all paths (OAuth link found AND email auto-link)
- Implementation in `InMemoryUserStore` and `DbUserStore`

This is tracked separately and not part of the initial implementation scope.

---

## 11. Review Findings Log

### DX Review — APPROVED WITH NOTES → Addressed
1. ~~Fallback vs default mapProfile inconsistency~~ Fixed: providers always have `mapProfile`, no fallback branch (1.5)
2. ~~Fail fast on updateOnSignIn~~ Deferred to future section (Section 10)
3. ~~Avoid `as GithubProfile` cast~~ Fixed: type-erased at provider boundary, documented in type flow (1.4, Section 6)
4. ~~Show updated OAuthProvider interface~~ Added (1.4)
5. ~~Document Google profile limitations~~ Added note in 1.2

### Product Review — APPROVED WITH NOTES → Addressed
1. ~~Defer Phase 3 (updateOnSignIn)~~ Done: moved to Section 10 as future work
2. ~~Acknowledge OAuthProviderConfig type-level breaking change~~ Added (Section 9)
3. ~~Add OAuthProvider interface change to Phase 2~~ Added (Phase 2 work items)

### Technical Review — CHANGES REQUESTED → Addressed
1. ~~OAuthProvider interface not updated~~ Fixed: shown in 1.4 with `mapProfile` field
2. ~~Google provider ID token limitations~~ Documented in 1.2, Phase 1 scoped to OIDC claims
3. ~~mapProfile can overwrite id/email/role~~ Fixed: spread order reversed — framework fields win (1.5)
4. ~~DbUserStore silently drops extra fields~~ Documented in Unknown 4.2
5. ~~updateOnSignIn for auto-link path~~ Deferred with Phase 3 (Section 10)
6. ~~Existing type tests need updating~~ Added to Phase 1 work items
7. ~~Default mapProfile vs handler fallback ambiguity~~ Fixed: providers always have mapProfile, one code path (1.5)
