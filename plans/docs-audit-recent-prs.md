# Docs Audit — Recent PRs (March 22–24, 2026)

## Summary

Seven recent PRs introduced features or changes that are missing or outdated in the docs. This plan covers updating `packages/mint-docs/` to match the current library code.

## Scope

| PR | Feature | Change Type |
|----|---------|-------------|
| #1767 | `domain()` API for bounded context grouping | New page |
| #1768 | Composite primary keys in `d.table()` | New section in schema guide |
| #1752 | Form field revalidation (`revalidateOn`) | New section in forms guide + API ref |
| #1741 | SSR single-pass with zero-discovery prefetch | Update existing SSR guide |
| #1763 | RLS pipeline (migration integration, `withSessionVars`) | Update migrations + codegen guides |
| #1751 | `rules.where()` pushed to DB for get/update/delete | Update auth guide |
| #1749 | Prepared statements (automatic) | New section in queries guide |

## Non-Goals

- No new API reference pages (these are guide-level updates)
- No migration guides for removed APIs (queryMatch, ListTransition) — pre-v1, no external users
- No performance benchmarking page — just a note about prepared statements

---

## Phase 1: Server Docs — `domain()` Page + `rules.where()` DB Enforcement

### New file: `packages/mint-docs/guides/server/domains.mdx`

Document the `domain()` API:
- What it does (bounded context grouping with route prefixing)
- API surface: `domain(name, config)` → `DomainDefinition`
- `DomainConfig`: `entities`, `services`, `middleware`
- Name validation rules (lowercase kebab-case, `/^[a-z][a-z0-9-]*$/`)
- Route prefixing: `/api/{domainName}/{entityOrServiceName}`
- Domain-scoped middleware (runs after global, isolated per domain)
- Collision detection (duplicate names, cross-domain, domain vs top-level)
- Mixed usage: domains + top-level entities/services
- Cross-domain entity injection
- Tenant scoping works seamlessly

### Update: `packages/mint-docs/guides/server/overview.mdx`

- Add "Domains" row to the "What's included" table
- Add a "Domains" card to the Guides card group

### Update: `packages/mint-docs/guides/server/auth.mdx`

- Expand `rules.where()` section to explain DB-level enforcement
- Note: where conditions are pushed into the SQL query for list, get, update, delete
- Security benefit: zero row leakage, TOCTOU protection on mutations
- Caveat: `rules.where()` inside `rules.any()` is still evaluated in-memory

### Update: `packages/mint-docs/docs.json`

- Add `"guides/server/domains"` to the vertz/server navigation group (after "entities")

### Acceptance Criteria

```typescript
describe('Phase 1: Server docs', () => {
  describe('Given the domains.mdx page exists', () => {
    it('documents domain() function signature and DomainConfig type', () => {})
    it('shows route prefixing example with code block', () => {})
    it('explains name validation rules', () => {})
    it('shows domain middleware usage', () => {})
    it('explains collision detection with error examples', () => {})
    it('shows mixed top-level + domain usage', () => {})
  })
  describe('Given the overview.mdx is updated', () => {
    it('includes Domains in the features table', () => {})
    it('includes a Domains card in the guide links', () => {})
  })
  describe('Given the auth.mdx is updated', () => {
    it('explains rules.where() DB-level enforcement', () => {})
    it('notes TOCTOU protection for mutations', () => {})
  })
  describe('Given docs.json is updated', () => {
    it('includes guides/server/domains in navigation', () => {})
  })
})
```

---

## Phase 2: DB Docs — Composite PKs + RLS Pipeline + Prepared Statements

### Update: `packages/mint-docs/guides/db/schema.mdx`

Add "Composite Primary Keys" section:
- Syntax: `d.table(name, columns, { primaryKey: ['col1', 'col2'] })`
- Type behavior: required in `$insert` (unless `.default()`), excluded from `$update`
- Cannot mix with column-level `.primary()`
- Validation: empty array rejected, non-existent columns rejected
- Entity CRUD limitation: composite PKs not supported in entity CRUD (use surrogate PK + unique index)

### Update: `packages/mint-docs/guides/db/migrations.mdx`

Add "RLS Policies" section:
- How codegen RLS output integrates with `migrateDev({ rlsPolicies })`
- Migration SQL ordering: ENABLE RLS → DROP old → CREATE new → DISABLE removed
- Snapshot tracks RLS state for incremental diffs
- Link to codegen guide for generation details

### Update: `packages/mint-docs/guides/db/queries.mdx`

Add "Prepared Statements" section:
- Automatic — enabled by default, no configuration needed
- PostgreSQL caches query plans for repeated queries
- Transparent to all query APIs (typed client, raw SQL, transactions)

### Update: `packages/mint-docs/guides/server/codegen.mdx`

- Update RLS section workflow: mention `migrateDev({ rlsPolicies })` integration as the recommended path (vs manual copy-paste)
- Add `withSessionVars()` usage for per-request session variable scoping
- Show how `withSessionVars()` connects auth context to RLS enforcement

### Acceptance Criteria

```typescript
describe('Phase 2: DB docs', () => {
  describe('Given schema.mdx composite PK section', () => {
    it('shows primaryKey table option syntax', () => {})
    it('explains type behavior for $insert and $update', () => {})
    it('documents validation rules', () => {})
    it('notes entity CRUD limitation with workaround', () => {})
  })
  describe('Given migrations.mdx RLS section', () => {
    it('shows rlsPolicies option in migrateDev()', () => {})
    it('explains migration SQL ordering', () => {})
  })
  describe('Given queries.mdx prepared statements section', () => {
    it('notes automatic enablement', () => {})
    it('explains performance benefit', () => {})
  })
  describe('Given codegen.mdx RLS update', () => {
    it('mentions migrateDev integration', () => {})
    it('documents withSessionVars() usage', () => {})
  })
})
```

---

## Phase 3: UI Docs — Form Revalidation + SSR Single-Pass

### Update: `packages/mint-docs/guides/ui/forms.mdx`

Add "Field Revalidation" section:
- `revalidateOn` option: `'blur'` (default), `'change'`, `'submit'`
- Behavior: only re-validates fields with prior errors, only after first submit
- Example showing each mode

### Update: `packages/mint-docs/api-reference/ui/form.mdx`

- Add `revalidateOn` to FormOptions table with type, default, and description

### Update: `packages/mint-docs/guides/ui/ssr.mdx`

- Replace "How it works" three-step flow from two-pass to single-pass:
  1. Discovery-only execution — lightweight pass captures queries without rendering
  2. Prefetch — awaits all discovered queries with per-query timeouts
  3. Render — single render pass with pre-populated cache produces final HTML
  4. Hydration — client picks up server-rendered DOM and data
- Update "Query pre-fetching" section to reference discovery-only execution
- Keep streaming/timeout section (still accurate), clarify it applies in both phases

### Acceptance Criteria

```typescript
describe('Phase 3: UI docs', () => {
  describe('Given forms.mdx revalidation section', () => {
    it('documents revalidateOn option with all three modes', () => {})
    it('explains the hasSubmitted guard', () => {})
    it('shows usage example', () => {})
  })
  describe('Given form.mdx API reference', () => {
    it('includes revalidateOn in FormOptions table', () => {})
  })
  describe('Given ssr.mdx updated flow', () => {
    it('describes single-pass rendering (not two-pass)', () => {})
    it('explains discovery-only execution', () => {})
    it('keeps streaming/timeout section accurate', () => {})
  })
})
```

---

## Quality Gates (per phase)

- `bun run lint` — lint clean
- `cd packages/docs && npx mint validate` — docs validate (if available)
- Manual review: code examples compile conceptually, no stale API references
