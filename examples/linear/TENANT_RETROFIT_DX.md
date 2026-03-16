# Tenant Scoping Retrofit — DX Report

Documenting the experience of adding multi-tenancy to the Linear clone after the app was already built.

## What Was Changed

- **4 tables** gained a `tenantId` column (users, projects, issues, comments)
- **Seed data** updated to include a default tenant ID
- **Server config** gained a `tenant.verifyMembership` callback
- **`onUserCreated` hook** explicitly sets tenantId for new signups
- **E2E tests** now call `/api/auth/switch-tenant` after signup

## What Was Easy

1. **Schema changes** — Adding `tenantId: d.text()` to each table definition was trivial. The schema builder made it a one-line addition per table.

2. **Auto-scoping just works** — Zero changes to entity access rules. The framework detected `tenantId` columns and automatically added tenant filtering to all CRUD operations. No manual `rules.where({ tenantId: ... })` needed.

3. **Entity files untouched** — `users.entity.ts`, `projects.entity.ts`, `issues.entity.ts`, and `comments.entity.ts` required zero modifications. The framework handled everything.

4. **Seed data** — Straightforward: export a constant `SEED_TENANT_ID`, add `tenant_id` to each INSERT statement.

5. **Before hooks preserved** — The existing `before.create` hooks (auto-increment issue numbers, auto-set `createdBy`/`authorId`) continued working without changes. The framework's tenant auto-set runs at a different layer (crud-pipeline) and doesn't interfere.

## What Was Painful

1. **Raw SQL table definitions** — Because the Linear clone uses raw `CREATE TABLE` SQL in `db.ts` (dev-only auto-migration), every table needed a manual `tenant_id TEXT NOT NULL DEFAULT ''` addition. A proper migration system would have made this a single migration file. Having the schema defined in two places (d.table and CREATE TABLE) is error-prone.

2. **Chicken-and-egg at signup** — When `onUserCreated` fires, the user's session has no `tenantId` yet (they just signed up). The framework's auto-set (`input.tenantId = ctx.tenantId`) is skipped when `ctx.tenantId` is null. So `onUserCreated` must explicitly pass `tenantId` in the create data. This is a footgun — if you forget, the user is created with `tenantId: ''` and becomes invisible to tenant-scoped queries.

3. **E2E test two-step auth** — After signup, a separate `POST /api/auth/switch-tenant` call is needed before the user can see any tenant-scoped data. This makes the test setup more complex. A `defaultTenantId` option in the auth config (auto-switch on first login) would simplify this.

4. **No DB migration story** — The `CREATE TABLE IF NOT EXISTS` pattern means existing databases won't get the new columns. Users must delete their `data/linear.db` and restart. A real app needs `ALTER TABLE ... ADD COLUMN`.

## What the Framework Could Improve

1. **`defaultTenantId` or `onSignup.tenantId`** — Allow setting an initial tenantId during signup so the first session already includes it. This would eliminate the two-step auth flow and the footgun in `onUserCreated`.

2. **Warn on missing tenantId in create** — When a tenant-scoped entity's create is called with no `tenantId` in context AND no `tenantId` in the input data, log a warning or throw. Currently it silently inserts with whatever default the DB has (empty string), creating orphaned records.

3. **Schema-driven DDL** — If the framework could generate `CREATE TABLE` SQL from `d.table()` definitions, the schema would be defined once. This would make retrofits like adding `tenantId` a single-line change instead of editing two files.

4. **Migration support** — `ALTER TABLE ADD COLUMN` generation from schema diffs would make retrofitting production databases feasible.

## Verdict

Adding tenant scoping after the fact was **surprisingly easy** at the application layer. The framework's auto-detection of `tenantId` columns and automatic WHERE filtering meant zero changes to entity definitions or access rules. The pain points were all around infrastructure (raw SQL, migrations) and the signup flow (chicken-and-egg with session tenantId). For a production app, the signup flow would need a proper tenant creation/invitation system anyway, so the `onUserCreated` explicitness is acceptable — but a `defaultTenantId` shortcut for simple single-tenant-per-user apps would significantly reduce friction.

**Total LOC changed: ~30 lines of actual logic** (excluding SQL boilerplate and test updates).
