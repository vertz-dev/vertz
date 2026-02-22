# Adversarial Review: Schema Migrations Design Doc

**Reviewer:** Josh (DevRel)  
**File:** `plans/design-schema-migrations.md`  
**Verdict:** Needs major revision — DO NOT APPROVE

---

## 1. Developer Experience — 2/10 ❌

- The ASCII flow diagram is busy but doesn't explain *when* to use `push` vs `migrate dev` vs `migrate deploy`
- No getting started guide. Devs won't know how to go from zero → first migration
- `createDbProvider({ schema, migrations })` is clunky—passing schema twice

## 2. Footguns — 1/10 ⚠️

- **⚠️ Destructive changes auto-apply in dev mode** — devs will accidentally drop tables
- Snapshot is gitignored — lose `.vertz/` folder and you're toast (no recovery)
- No team conflict handling — two devs add columns to same table = chaos

## 3. API Intuition — 3/10

- No TypeScript types shown, just prose descriptions
- `SchemaSnapshot` structure is completely opaque
- CLI is inconsistent: `vertz db push` vs `vertz db migrate dev` vs `vertz db status`

## 4. Error Handling — 1/10 ❌

- Missing: partial migration failures, corrupted snapshot, checksum conflicts, schema drift
- `@rollback` marker mentioned but never explained — when is it used? Auto-rollback?
- Zero troubleshooting guidance

## 5. Consistency — 5/10 ⚠️

- **Critical:** The `@vertz/db` package **already has** migration infrastructure (`migrateDev`, `migrateDeploy`, `push`, `migrateStatus`)
- This design ignores it completely and proposes new components that already exist in `packages/db/src/migration/`
- CLI structure (`vertz db migrate deploy`) doesn't match existing patterns (`vertz deploy`, `vertz dev`)

## 6. What's Missing — 2/10

- No data migration/seeding story
- No rollback/undo command (`vertz db migrate undo`)
- No "migrate to version X"
- No validation that schema in code matches DB
- No multi-DB support (main + replica + test)
- No locking for long-running migrations

---

## Summary

| Category | Score |
|----------|-------|
| DX Clarity | 2/10 |
| Safety/Footguns | 1/10 |
| API Intuition | 3/10 |
| Error Handling | 1/10 |
| Consistency | 5/10 |
| Completeness | 2/10 |

---

## Recommendation

**DO NOT APPROVE.** The team should:

1. **Audit existing `@vertz/db` migration code** before redesigning
2. **Add a getting started guide** with real examples
3. **Add comprehensive error handling** for all failure modes
4. **Fix the inconsistent CLI structure** to match existing vertz patterns
5. **Add rollback/undo story**
6. **Protect against destructive changes** in dev mode (require confirmation, not auto-apply)
