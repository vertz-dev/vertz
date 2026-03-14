# Auth-Entity Bridge

**Status:** Draft (Rev 4 — addressing DX, Product, Technical review feedback)
**Author:** Claude
**Date:** 2026-03-12

## Problem

Auth users live in isolation from the entity system. The auth system manages its own `auth_users` table — identity, credentials, sessions. But developers need user data (name, avatar, bio) in their own entities for queries, relations, and access rules. Today there's no bridge: auth creates a user, but the developer's `users` entity knows nothing about it.

## Design Principle

**The auth table is a black box.** It stores what the framework needs to run authentication — nothing more. Developers never touch it directly. When auth succeeds, the framework fires a callback. The developer uses that callback to populate their own tables.

This separation enables:
- Auth internals can change without breaking developer schemas
- Policy data (roles, entitlements, plans, flags) can be extracted to an external store
- On Vertz Cloud, policy evaluation runs at the edge with smart caching — the declarative `rules.*` descriptors make this possible because they're serializable
- The developer's SQLite stays lean — just their domain data

## API Surface

```typescript
import { createServer, entity } from '@vertz/server';
import { type GithubProfile } from '@vertz/server/auth/providers';
import { d } from '@vertz/db';
import { rules } from '@vertz/server/auth/rules';

// Developer's own users entity — a normal entity, nothing special
const usersTable = d.table('users', {
  id: d.text().primary(),
  email: d.text(),
  name: d.text().nullable(),
  avatarUrl: d.text().nullable(),
  githubUsername: d.text().nullable(),
  bio: d.text().nullable(),
  createdAt: d.timestamp().default('now'),
});

const usersModel = d.model(usersTable);

const users = entity('users', {
  model: usersModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    update: rules.where({ id: rules.user.id }),
  },
});

// Auth config with lifecycle callbacks
const app = createServer({
  db,
  entities: [users, tasks, projects],
  auth: {
    session: { strategy: 'jwt', ttl: '15m' },
    providers: [
      github({ clientId: '...', clientSecret: '...' }),
    ],

    // Fires after a new user is created in the auth system
    onUserCreated: async (payload, ctx) => {
      if (payload.provider) {
        // OAuth sign-up — payload.profile has the full provider API response
        if (payload.provider.id === 'github') {
          const profile = payload.profile as GithubProfile;
          await ctx.entities.users.create({
            id: payload.user.id,
            email: payload.user.email,
            name: profile.name ?? profile.login,
            avatarUrl: profile.avatar_url,
            githubUsername: profile.login,
            bio: profile.bio,
          });
        }
      } else {
        // Email/password sign-up — payload.signUpData has the form fields
        await ctx.entities.users.create({
          id: payload.user.id,
          email: payload.user.email,
          name: payload.signUpData.name as string ?? null,
        });
      }
    },
  },
});
```

### Callback Types

```typescript
interface AuthCallbackContext {
  /** System-level entity access — bypasses access rules.
   *  This is intentional: during sign-up, the user isn't authenticated yet,
   *  so access rules like rules.authenticated() would block the callback. */
  entities: Record<string, EntityOperations>;
}

/** Discriminated union — OAuth and email/password are distinct shapes. */
type OnUserCreatedPayload =
  | {
      /** The auth user that was just created. */
      user: AuthUser;
      /** The OAuth provider that created this user. */
      provider: { id: string; name: string };
      /** Full provider API response (cast to GithubProfile, GoogleProfile, etc.). */
      profile: Record<string, unknown>;
    }
  | {
      /** The auth user that was just created. */
      user: AuthUser;
      /** null for email/password sign-up. */
      provider: null;
      /** Extra fields from the sign-up form (via schema passthrough). */
      signUpData: Record<string, unknown>;
    };

interface AuthConfig {
  // ... existing config ...

  /** Called after a new user is created in the auth system.
   *  Fires before the session is created.
   *  If this throws, the auth user is rolled back (deleted). */
  onUserCreated?: (payload: OnUserCreatedPayload, ctx: AuthCallbackContext) => Promise<void>;
}
```

### Lifecycle Timing

```
Email/password sign-up:
  1. Validate input + hash password
  2. userStore.createUser(user, passwordHash)
  3. ▶ onUserCreated({ user, provider: null, signUpData }, ctx)
  4. If callback throws → userStore.deleteUser(user.id) → return error
  5. Create session + issue tokens
  6. Return success response

OAuth callback:
  1. Exchange code for tokens
  2. Get user info from provider (includes raw profile)
  3. userStore.createUser(user, null)
  4. oauthAccountStore.linkAccount(userId, providerId, ...)
  5. ▶ onUserCreated({ user, provider, profile: userInfo.raw }, ctx)
  6. If callback throws → oauthAccountStore.unlinkAccount(...) → userStore.deleteUser(user.id) → redirect with ?error=user_setup_failed
  7. Create session + issue tokens
  8. Redirect to success URL
```

### What `auth_users` Contains (Framework Only)

```
auth_users
├── id           (text, PK)
├── email        (text)
├── passwordHash (text, nullable)
├── role         (text, default 'user')
├── emailVerified (boolean, default false)
├── createdAt    (timestamp)
└── updatedAt    (timestamp)
```

No `name`, no `avatarUrl`, no `plan`, no custom fields. Framework-only.

### What Happens to `mapProfile`

It's removed. We shipped `mapProfile` as a stepping stone while exploring the right architecture. The `onUserCreated` callback supersedes it: instead of mapping provider data into `auth_users` (which shouldn't have custom fields), the developer maps it into their own entity in the callback.

This is an intentional tradeoff: we foreclose the "custom UserStore with extra auth columns" pattern in favor of the clean separation between auth tables (framework) and user entities (developer). This enables the Vertz Cloud edge policy architecture.

The typed provider profiles (`GithubProfile`, `GoogleProfile`, `DiscordProfile`) remain exported — they're useful for typing `profile` in the callback. The `raw` field on `OAuthUserInfo` also remains — it carries the provider response to the callback.

### Tenant Scoping

Auth users are **cross-tenant by design** — one user belongs to many workspaces/orgs via membership. The `auth_users` table has no `tenantId` column, so the entity system auto-detects `tenantScoped: false`. Tenant-scoped user access (e.g., "list members of my workspace") is handled by a separate membership entity, not by scoping the user table.

## Manifesto Alignment

- **Principle 1 (One model, full stack)**: The developer's user model is their own entity. Auth doesn't dictate its shape.
- **Principle 2 (LLM-first)**: `onUserCreated` is a single, obvious callback. No hidden wiring between auth and entity systems.
- **Principle 3 (Zero boilerplate)**: One callback handles the bridge. No sync tables, no adapters, no special entity types.
- **Principle 7 (Secure by default)**: Auth table is a black box. Credentials never leak to the entity layer. `ctx.entities` uses system-level privileges (documented, intentional).

## Non-Goals

- **User deletion API / `onUserDeleted`**: Separate feature. When account deletion is added, there'll be a corresponding lifecycle hook.
- **`onUserLogin` / profile refresh**: Deferred. When implemented, `onUserLogin` will fire on every successful authentication, giving the developer the chance to refresh profile data. Not needed for MVP.
- **Exposing `auth_users` as an entity**: Auth tables are internal. Developers define their own user entity.
- **Automatic sync**: No magic that mirrors `auth_users` to a developer table. The callback is explicit.
- **Replacing UserStore**: `DbUserStore` continues to manage `auth_users` internally.
- **Custom UserStore with extra auth columns**: The framework doesn't optimize for this. `auth_users` stores only framework fields. Extra user data belongs in the developer's own entity.

## Migration

No migration needed. `mapProfile` was committed in the same feature branch (`feat/oauth-profile-mapping`) and has no production users. The removal is a design pivot within the same body of work, not a breaking migration.

## Unknowns

1. **Entity registry wiring**: `createAuth()` currently has no reference to the entity registry. Resolution: `createServer()` passes `registry.createProxy()` as an optional field on `AuthConfig`. By the time `onUserCreated` fires, the registry is fully populated (entities registered at line 256-261, auth created at line 301).

2. **Callback failure rollback**: If `onUserCreated` throws, the auth user must be rolled back. Resolution: add `deleteUser(id: string)` to the `UserStore` interface + both implementations. For OAuth, also unlink the account. Error responses: OAuth redirects to `errorRedirect?error=user_setup_failed`, email/password returns `Result` with `AuthError` variant.

3. **`AuthUser` index signature cleanup**: `AuthUser` currently has `[key: string]: unknown` which allowed arbitrary fields. Since `auth_users` no longer stores custom fields, this index signature should be removed and `AuthUser` should become a closed interface with only framework fields. The `safeFields` spread in the email sign-up path should be removed — extra fields go to `signUpData` in the callback instead.

4. **`OAuthUserInfo.name` and `avatarUrl` become vestigial**: After removing `mapProfile`, nobody reads these fields. The `raw` field carries the full profile. Resolution: remove `name` and `avatarUrl` from `OAuthUserInfo`, keep only `providerId`, `email`, `emailVerified`, and `raw`.

## Type Flow Map

```
OAuth flow:
  GitHub API → OAuthUserInfo { providerId, email, emailVerified, raw: Record<string, unknown> }
    → auth creates user in auth_users (id, email, role — framework fields only)
      → oauthAccountStore.linkAccount(...)
        → onUserCreated({ user, provider: { id: 'github', name: 'GitHub' }, profile: raw }, ctx)
          → ctx.entities.users.create({ id, email, name, avatarUrl, ... })
            → developer's users table (typed entity CRUD)

Email/password flow:
  Sign-up form → { email, password, name, avatarUrl }
    → auth creates user in auth_users (id, email, role — framework fields only)
      → onUserCreated({ user, provider: null, signUpData: { name, avatarUrl } }, ctx)
        → ctx.entities.users.create({ id, email, name, avatarUrl })
          → developer's users table
```

## E2E Acceptance Test

```typescript
describe('Feature: Auth-entity bridge via onUserCreated', () => {
  describe('Given a server with auth and a users entity', () => {
    describe('When a user signs up via OAuth (GitHub)', () => {
      it('Then onUserCreated fires with provider and profile fields', async () => {
        // payload.provider.id === 'github'
        // payload.profile contains full GitHub API response
      });

      it('Then the developer can create a record in their users entity', async () => {
        // GET /api/users/:id returns user with name, avatarUrl from GitHub
      });

      it('Then auth_users only contains framework fields', async () => {
        // SELECT * FROM auth_users → no name, no avatarUrl columns
      });
    });

    describe('When a user signs up via email/password', () => {
      it('Then onUserCreated fires with provider: null and signUpData', async () => {
        // payload.provider === null
        // payload.signUpData contains extra form fields
      });
    });

    describe('When onUserCreated throws', () => {
      it('Then the auth user is rolled back (deleted)', async () => {
        // User does not exist in auth_users
      });

      it('Then OAuth flow redirects with error=user_setup_failed', async () => {
        // Location header contains ?error=user_setup_failed
      });

      it('Then email/password flow returns an error result', async () => {
        // Result.ok === false, error variant is descriptive
      });
    });

    describe('When onUserCreated is not provided', () => {
      it('Then auth works normally without side effects', async () => {
        // Sign-up succeeds, session created, no entity operations
      });
    });

    describe('When ctx.entities is used in the callback', () => {
      it('Then entity operations bypass access rules (system-level)', async () => {
        // Even with rules.authenticated() on create, the callback succeeds
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: `onUserCreated` callback + `deleteUser` + entity registry wiring

1. Add `deleteUser(id: string): Promise<void>` to `UserStore` interface
2. Implement in `InMemoryUserStore` and `DbUserStore`
3. Add `onUserCreated` to `AuthConfig` type with the discriminated union payload
4. Add optional `_entityProxy` field to `AuthConfig` (internal — set by `createServer`)
5. Wire `registry.createProxy()` into auth config in `createServer()` (after entity registration)
6. Call `onUserCreated` in the email/password sign-up path (after `createUser`, before session)
7. Call `onUserCreated` in the OAuth callback path (after `createUser` + `linkAccount`, before session)
8. Wrap callback in try/catch with rollback: delete user (+ unlink account for OAuth)
9. Error responses: OAuth → redirect `?error=user_setup_failed`, email/password → error `Result`

**Acceptance criteria:**
```typescript
describe('Given auth with onUserCreated', () => {
  describe('When email/password sign-up', () => {
    it('Then callback fires with { user, provider: null, signUpData }');
    it('Then ctx.entities is available and operational');
  });
  describe('When OAuth sign-up', () => {
    it('Then callback fires with { user, provider: { id, name }, profile }');
  });
  describe('When callback throws', () => {
    it('Then auth user is deleted (rollback)');
    it('Then OAuth account link is removed');
    it('Then OAuth redirects with ?error=user_setup_failed');
    it('Then email/password returns error Result');
  });
  describe('When callback not provided', () => {
    it('Then auth works normally');
  });
});
```

### Phase 2: Remove `mapProfile` + clean up types

1. Remove `mapProfile` call and `mappedFields` spread from OAuth handler in `auth/index.ts`
2. Remove `mapProfile` from `OAuthProvider` interface
3. Remove `mapProfile` from `OAuthProviderConfig`
4. Remove `defaultMapProfile` from each provider (github, google, discord)
5. Remove `name` and `avatarUrl` from `OAuthUserInfo` (keep only `providerId`, `email`, `emailVerified`, `raw`)
6. Remove `[key: string]: unknown` index signature from `AuthUser` — closed interface
7. Remove `safeFields` spread in email sign-up path — extra fields go to `signUpData`
8. Keep typed profiles (`GithubProfile`, `GoogleProfile`, `DiscordProfile`) exported
9. Keep `raw` on `OAuthUserInfo`
10. Revert secure spread to simple auth-only field assignment
11. Update all tests

**Acceptance criteria:**
- `OAuthProvider` interface has no `mapProfile`
- `OAuthUserInfo` has no `name` or `avatarUrl`
- `AuthUser` is a closed interface (no index signature)
- `auth_users` INSERT only writes framework columns
- Typed profiles still exported and usable
- All auth tests pass (updated for new interfaces)

### Phase 3: Integration test — full flow

1. Full e2e: OAuth sign-up → `onUserCreated` populates developer entity → entity CRUD returns user data → relations resolve users
2. Email/password sign-up → `onUserCreated` → entity CRUD
3. Auth without `onUserCreated` → works normally
4. Rollback scenario: callback throws → verify cleanup

**Acceptance criteria:**
- E2E acceptance test from this design doc passes
- Relation include on `tasks.createdBy` resolves developer's user entity
- `auth_users` table only has framework columns
- System-level entity access works in callback (bypasses access rules)

## Review Findings Log

### Rev 1 (2026-03-12)
Proposed `authUserEntity()` — a special function that exposed `auth_users` as an entity. Rejected by user: introduces unnecessary API surface and lets developers mess with the framework's auth table.

### Rev 2 (2026-03-12)
Addressed DX/Product/Technical feedback on Rev 1 (column protection, SQL injection, type validation). Same architecture — still rejected.

### Rev 3 (2026-03-12)
Complete redesign: auth table is a black box, `onUserCreated` callback bridges to developer's entities. User approved direction. Sent to review agents.

### Rev 3 → Rev 4 (2026-03-12)
Findings from DX, Product, Technical reviewers:

1. **DX (Major)**: `raw` overloaded for OAuth and email/password — split into `profile` (OAuth) and `signUpData` (email/password) via discriminated union.
2. **DX (Major)**: Per-provider typing lost — mitigated by keeping typed profile exports. Developer casts `profile as GithubProfile` after checking `provider.id`. Not as good as `mapProfile`'s generics, but acceptable for a single callback that branches on provider.
3. **DX (Moderate)**: Added lifecycle timing section showing exact order of operations.
4. **Technical (High)**: `UserStore` has no `deleteUser` — added to Phase 1 as prerequisite.
5. **Technical (Medium)**: `ctx.entities` bypasses access rules — documented as intentional (system-level privileges during sign-up).
6. **Technical (Medium)**: Full OAuth rollback sequence documented (unlink account + delete user).
7. **Technical (Medium)**: `AuthUser` index signature removal and `OAuthUserInfo.name/avatarUrl` cleanup added to Phase 2.
8. **Technical (Medium)**: Error contracts specified per path (OAuth redirect param, email/password error Result).
9. **Product**: `onUserLogin` added as explicit non-goal with forward reference.
10. **Product**: Migration section added (no migration — same feature branch, no production users).
11. **Product**: `mapProfile` removal framed as intentional evolution, not a mistake.
12. **DX (Minor)**: `onUserCreated` lives on `AuthConfig` (passed to `createServer({ auth: { ... } })`). Callback family: `onUserCreated`, `onUserDeleted`, `onUserLogin` (future).
