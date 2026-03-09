# DX Review: DB-Backed Auth Stores

**Reviewer:** josh (Developer Advocate)
**PR:** #1068 | **Issue:** #1059
**Design doc:** `plans/db-backed-auth-stores.md`
**Date:** 2026-03-09

---

## Blockers

### 1. Breaking change to `createServer({ auth })` is under-documented and will confuse every existing user

The current docs (`packages/docs/guides/server/auth.mdx`) show:

```ts
const auth = createAuth({ session: { strategy: 'jwt', ttl: '60s' } });
const app = createServer({ entities: [...], db, auth });
```

Here `auth` is an `AuthInstance` (the *result* of `createAuth()`).

The design doc proposes `auth` on `ServerConfig` becomes an `AuthConfig` (the *config object*, not the instance). `createServer` would internally call `createAuth()`.

This is a silent semantic change. Today a developer passes an **instance**; tomorrow they pass a **config**. TypeScript will catch the shape mismatch, but the error message will be "Type 'AuthInstance' is not assignable to type 'AuthConfig'" -- which is technically correct but tells the developer nothing about *what changed* or *what to do*.

**What to do:** The design doc must explicitly address this migration. Options:
- Accept both (discriminated by shape -- has `handler` = instance, has `session` = config). This is gross; don't do it.
- Rename the field: `createServer({ authConfig: { ... } })` to make the break obvious. Also gross.
- Best option: keep the current `auth` field accepting `AuthInstance`, add a new convenience where if `db` is present and `auth` is a plain config object (no `handler` property), `createServer` calls `createAuth` internally. Use a type union `auth?: AuthConfig | AuthInstance` with a runtime discriminator. Document the migration: "You can now pass auth config directly; the old `createAuth()` + pass instance pattern still works."

This is the most critical DX issue. Every existing code example breaks, and the design doc doesn't acknowledge it.

### 2. `authModels` must be manually spread into `createDb()` -- this will be the #1 support question

The proposed setup:

```ts
const db = createDb({
  models: { ...authModels, ...myModels },
  dialect: 'sqlite',
});
```

When a developer forgets `...authModels`, what happens? The design doc says `createServer` passes `db` to `createAuth`, which auto-selects DB stores. But those DB stores need the auth tables to exist. If the developer passes `db` but forgot `authModels`, the failure mode is:

1. `createServer({ db, auth: { ... } })` -- looks fine
2. `await app.initialize()` -- creates tables via DDL... but wait, does it need the models registered in `createDb`? The POC shows raw DDL (`CREATE TABLE IF NOT EXISTS`). So the tables get created in the DB, but the `DatabaseClient` doesn't know about them (no model delegates like `db.auth_users`).
3. The DB stores try to use `db.auth_users` -- undefined. Runtime crash.

**The error will be inscrutable.** Something like "Cannot read properties of undefined (reading 'findOne')" deep in a store implementation.

**What to do:** Either:
- (a) Validate at `createServer()` time: if `db` is a `DatabaseClient` and `auth` config is present, check that `auth_users` exists in `db._internals.models`. Throw a clear error: "Auth requires auth models to be registered in createDb(). Add `...authModels` to your models: `createDb({ models: { ...authModels, ...myModels } })`". You already do this validation for entity models (lines 143-157 of `create-server.ts`). Do the same for auth.
- (b) Better yet, make `authModels` registration automatic. If `createServer` detects `db` + `auth` config, it could inject the auth models into the database client internally. This removes the footgun entirely. The explicit `...authModels` spread becomes opt-in for advanced cases (custom columns, etc.).

Option (b) is the dream DX. Option (a) is the minimum acceptable bar.

### 3. The E2E acceptance test uses `app.auth.api.signUp()` but `AppBuilder` has no `auth` property

The current `AppBuilder` interface (in `packages/core/src/app/app-builder.ts`) has: `handler`, `listen`, `router`, `middlewares`. No `auth`.

The E2E test does:

```ts
const app = createServer({ db, auth: { ... } });
await app.auth.api.signUp({ ... });
```

This doesn't work with the current return type. The design doc doesn't address how `auth` becomes accessible on the server instance. Either:
- `createServer` returns an extended type with `auth: AuthInstance`
- Or there's a separate accessor

This needs to be specified. The developer needs to know how to access `auth.api` from the server instance. If the answer is "you also get it from a separate call," show that in the E2E test.

---

## Should-fix

### 4. `d.model()` vs `d.table()` inconsistency in the design doc

The design doc uses both `d.model(authUsersTable)` (in the authModels comment block, line 77) and `d.table()` (in the POC results, line 370). The codebase uses `d.table()`. Pick one and be consistent. Developers will copy-paste these examples.

### 5. The `initialize()` timing requirement is invisible

The design doc says `await app.initialize()` creates auth tables. But what happens if a developer forgets to call it? They'll get a "table auth_users does not exist" error on the first `signUp` call. That's a confusing failure mode for a framework that aims for "if it builds, it works."

**Suggestion:** Either:
- Auto-initialize on first use (lazy init with a flag)
- Or make `listen()` call `initialize()` automatically, so the dev server "just works"
- At minimum, if `initialize()` hasn't been called and a DB store operation fails with a missing-table error, catch it and throw a better error: "Did you forget to call `app.initialize()`?"

### 6. The "Standalone `createAuth()` still works" section shows `db` on `AuthConfig` -- contradicts "one way to do things"

The design doc says:
> No second config path for db (don't also accept `db` on auth config when using createServer)

But then shows:
```ts
const auth = createAuth({ session: { ... }, db }); // pass db explicitly
```

So `db` IS on `AuthConfig`. This means there are two ways to pass db to auth: via `createServer` (implicit) or via `createAuth` (explicit). The manifesto section explicitly says "no second config path for db" but then provides one.

This is fine for the standalone case, but the design doc should acknowledge the tension and explain why: standalone `createAuth()` needs it because there's no `createServer` to inject it. And state clearly: when using `createServer`, never pass `db` to auth config directly (and ideally, TypeScript should prevent it -- the `auth` field on `ServerConfig` should be `Omit<AuthConfig, 'db'>`).

### 7. No error story for "db present but wrong dialect"

What if someone passes a PostgreSQL db but auth's DDL uses SQLite-specific syntax (like `INTEGER` for booleans)? The POC shows `email_verified INTEGER NOT NULL DEFAULT 0` which is SQLite-ish. PostgreSQL would want `BOOLEAN NOT NULL DEFAULT FALSE`.

The design doc mentions dialect differences for JSON columns (resolved via text serialization) but doesn't address DDL dialect differences for all columns. The `initialize()` function needs dialect-aware DDL, and the design doc should acknowledge this.

### 8. Seven tables is a lot to ask developers to understand upfront

The `authModels` object has 7 tables. When a developer sees `...authModels` in their `createDb()` call, they'll wonder: "What tables did this just add to my database?" The design doc lists them, but in the running app, there's no way to see what auth created.

**Suggestion:** Log the created tables during `initialize()`:
```
[Auth] Created 7 tables: auth_users, auth_sessions, auth_oauth_accounts, ...
```
And if tables already exist:
```
[Auth] Auth tables already exist, skipping creation.
```

---

## Nits

### 9. `auth_wallet` table name is singular, others are plural

`auth_users`, `auth_sessions`, `auth_plans` -- all plural. But `auth_wallet` is singular. Should be `auth_wallets` for consistency.

### 10. The design doc comments show `d.model()` but the POC uses raw SQL

The authModels export shows `d.model(authUsersTable)` but the POC shows raw `CREATE TABLE` SQL. These are different code paths. Clarify: does `initialize()` use the model definitions to generate DDL, or does it use hardcoded SQL? If the latter, there's a maintenance risk (model and DDL can drift).

### 11. Missing `FlagStore` from the ephemeral stores discussion

The design doc lists `FlagStore` as ephemeral (line 56), which is correct. But FlagStore is a stub today (always returns enabled). Worth a one-liner noting that when FlagStore becomes real, it'll likely need persistence too, so the "ephemeral" classification is temporary.

### 12. The `cloud` field on `ServerConfig` is a string (API key) -- not self-documenting

```ts
cloud: process.env.VERTZ_CLOUD_KEY, // framework-level -- managed services
```

A developer seeing `cloud: string` in the type signature won't know what value to put there. Consider `cloudApiKey` or `vertzCloud: { apiKey: string }` when this field is actually implemented.

---

## Verdict

**Request changes.**

The core idea is right: `db` belongs on `createServer`, auth should auto-switch to DB stores, and the `...authModels` pattern follows established conventions (like Drizzle schema spreading). The migration from in-memory to DB-backed auth *should* be adding one import and one spread.

But three things must be resolved before implementation:

1. **The `auth` field type change is a breaking change** that the doc doesn't acknowledge or plan for. This will break every existing setup and the current docs. Either support both shapes or have a clear migration strategy in the doc.

2. **The missing-authModels footgun** needs a validation error at minimum, or automatic injection at best. Without it, the #1 support ticket will be "auth crashes with undefined after I added db."

3. **`app.auth` doesn't exist** on the return type. The E2E test can't work as written. The design doc needs to specify how auth is exposed from the server instance.

Fix those three, and this is a strong design that developers will genuinely enjoy using.
