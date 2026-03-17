# Tenant Scoping Retrofit — DX Report

Documenting the experience of adding multi-tenancy to the Linear clone after the app was already built.

## What Was Changed

- **1 new table**: `workspaces` — the tenant root (matching Linear's Workspace concept)
- **4 tables** gained a `workspaceId` column (users, projects, issues, comments)
- **Relation declarations**: `workspace: d.ref.one(() => workspacesTable, 'workspaceId')` on users and projects
- **Model options**: `{ tenant: 'workspace' }` on directly-scoped models
- **Seed data** updated to include a default workspace ID
- **Server config** gained a `tenant.verifyMembership` callback
- **`onUserCreated` hook** explicitly sets workspaceId for new signups
- **E2E tests** now call `/api/auth/switch-tenant` after signup

## Key Design Decision: Workspace as Tenant Root

In Linear, the top-level organizational unit is a **Workspace**, not a generic "tenant". The Vertz framework's tenant scoping system is relation-driven — any table can serve as the tenant root. We chose `workspaces` as the table name to match Linear's domain model.

The `{ tenant: 'workspace' }` model option tells the framework which relation points to the tenant root. The FK column is named `workspaceId` to match the domain language. The framework resolves the column name from the tenant relation's FK, so any name works (`workspaceId`, `orgId`, `tenantId`).

## What Was Easy

1. **Schema changes** — Adding `workspaceId: d.text()` to each table definition was trivial. The schema builder made it a one-line addition per table.

2. **Auto-scoping just works** — Zero changes to entity access rules. The framework detected the tenant relation and automatically added tenant filtering to all CRUD operations. No manual `rules.where({ workspaceId: ... })` needed.

3. **Entity files untouched** — `users.entity.ts`, `projects.entity.ts`, `issues.entity.ts`, and `comments.entity.ts` required zero modifications. The framework handled everything.

4. **Seed data** — Straightforward: export a constant `SEED_WORKSPACE_ID`, add `workspaceId` to each seed record.

5. **Before hooks preserved** — The existing `before.create` hooks (auto-increment issue numbers, auto-set `createdBy`/`authorId`) continued working without changes. The framework's tenant auto-set runs at a different layer (crud-pipeline) and doesn't interfere.

6. **Custom tenant root name** — The framework doesn't hardcode the table name. `workspaces`, `organizations`, `teams` — any table works as the tenant root as long as the relation declarations point to it.

7. **Custom FK column name** — The framework derives the tenant FK column name from the model's tenant relation. `workspaceId`, `orgId`, or `tenantId` all work — no hardcoded column name convention.

## What Was Painful

1. **Chicken-and-egg at signup** — When `onUserCreated` fires, the user's session has no tenant yet (they just signed up). The framework's auto-set is skipped when `ctx.tenantId` is null. So `onUserCreated` must explicitly pass `workspaceId` in the create data. This is a footgun — if you forget, the user is created with `workspaceId: ''` and becomes invisible to tenant-scoped queries.

2. **E2E test two-step auth** — After signup, a separate `POST /api/auth/switch-tenant` call is needed before the user can see any tenant-scoped data. This makes the test setup more complex. A `defaultTenantId` option in the auth config (auto-switch on first login) would simplify this.

## What the Framework Could Improve

1. **`defaultTenantId` or `onSignup.tenantId`** — Allow setting an initial tenantId during signup so the first session already includes it. This would eliminate the two-step auth flow and the footgun in `onUserCreated`.

2. **Warn on missing tenant value in create** — When a tenant-scoped entity's create is called with no tenant in context AND no tenant column value in the input data, log a warning or throw. Currently it silently inserts with whatever default the DB has (empty string), creating orphaned records.

## Verdict

Adding tenant scoping after the fact was **surprisingly easy** at the application layer. The framework's automatic detection of tenant relations and automatic WHERE filtering meant zero changes to entity definitions or access rules. The pain points were around the signup flow (chicken-and-egg with session tenantId). For a production app, the signup flow would need a proper workspace creation/invitation system anyway, so the `onUserCreated` explicitness is acceptable — but a `defaultTenantId` shortcut for simple single-workspace-per-user apps would significantly reduce friction.

**Total LOC changed: ~30 lines of actual logic** (excluding test updates).
