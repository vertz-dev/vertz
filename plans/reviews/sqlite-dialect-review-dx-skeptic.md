# DX Skeptic Review: SQLite Dialect Design

**Reviewer:** DX Skeptic (subagent)
**Date:** 2026-02-20

---

## Verdict

**Approve with Changes**

The design is solid overall, but there are a few DX paper cuts that could confuse developers—especially around type conversion surprises and API discoverability.

---

## Summary

The dialect abstraction is well-designed and properly decouples SQL generation from execution. However, the implicit type conversion for booleans (0/1) and timestamps (ISO string) on SQLite could surprise developers who expect native types. The `createDb()` API is clean, but the lack of a local SQLite driver for development is a gap worth noting.

---

## Concerns

1. **[Important] Boolean and timestamp conversion happens implicitly—could surprise developers**
   - SQLite stores booleans as INTEGER (0/1) and timestamps as TEXT (ISO 8601)
   - The driver converts: `true → 1` on write, `1 → true` on read; `Date → ISO string` on write, `ISO string → Date` on read
   - **Why it's a problem:** If a developer writes raw SQL (`db.query(sql...)`) or inspects the database directly, they'll see 0/1 and ISO strings—not native booleans or Date objects. This mismatch between "driver-aware" queries and raw SQL could cause confusion during debugging.
   - **Suggestion:** Document this prominently in migration guides and consider adding a debug mode that logs when conversions happen.

2. **[Important] The `dialect` option is not yet in the current `createDb()`—backward compat needs explicit handling**
   - The current `createDb()` only accepts `url` for Postgres. The design proposes adding `dialect?: 'postgres' | 'sqlite'` and `d1?: D1Database`.
   - **Why it's a problem:** If someone upgrades `@vertz/db` without reading the changelog, they'll get Postgres by default (or an error if `dialect: 'sqlite'` is used without `d1`). The behavior when `dialect` is omitted is unclear: does it default to Postgres? What if only `url` is provided?
   - **Suggestion:** Make `dialect` required when `d1` is provided, and default to `'postgres'` when `url` is provided. Emit a warning if neither is specified.

3. **[Important] No local SQLite driver for development—this is a DX gap**
   - The design explicitly defers "local SQLite driver (non-D1)" to v0.2.
   - **Why it's a problem:** Developers wanting to test SQLite locally (without Cloudflare Workers) have no path forward. They must either use D1 locally (requires Wrangler) or spin up Postgres. This contradicts the goal of "local development without Postgres."
   - **Suggestion:** At minimum, add a note in the docs about using `better-sqlite3` or `sql.js` as a temporary workaround, or provide a shim.

4. **[Minor] The `tables` registry is required for type conversion—this is a hidden dependency**
   - The SQLite driver needs `tables: TableRegistry` for "value conversion using column metadata."
   - **Why it's a problem:** Developers might not realize `tables` is doing double duty—it's not just for type inference and relations, it's also for driver-level conversion. If they pass an empty `tables` or wrong structure, conversion silently fails or behaves incorrectly.
   - **Suggestion:** Validate that `tables` contains the necessary metadata for conversion, or document this requirement clearly.

5. **[Minor] `supportsReturning` claim needs runtime verification**
   - The design says SQLite supports RETURNING "since 3.35+ (D1 supports this)."
   - **Why it's a minor issue:** D1 definitely supports it, but if someone uses an older SQLite version (e.g., system SQLite on older macOS), queries will fail silently or unexpectedly. The driver should check the SQLite version at initialization.
   - **Suggestion:** Add a version check in the SQLite driver and throw a clear error if RETURNING isn't supported.

6. **[Minor] PostgresDriver → DbDriver rename could break external imports**
   - The design proposes renaming `PostgresDriver` to `DbDriver` with a type alias for backward compat.
   - **Why it's minor:** TypeScript type aliases work, but if anyone is doing runtime checks (`instanceof`) or importing the class directly, they'll need updating. Unlikely, but worth a note in the migration guide.

---

## What's Good

- **Clean dialect interface:** The `Dialect` interface (`param()`, `now()`, `mapColumnType()`, etc.) is intuitive and maps well to actual SQL differences. LLM-friendly naming.

- **Zero schema changes for developers:** The `d.table()` definitions stay dialect-agnostic, which is the right goal. The abstraction lives where it should—in the SQL generation layer.

- **Parameter placeholder abstraction:** `$1` vs `?` is properly hidden behind `dialect.param()`. This is invisible to developers using the query builders.

- **Default dialect preserves backward compat:** Defaulting to `PostgresDialect` in SQL builders means existing code doesn't break immediately.

- **Type-safe `createDb()` options:** Adding `dialect` and `d1` as typed options makes it clear what combinations are valid. The error message for missing `d1` with `dialect: 'sqlite'` will be helpful.

- **ID generation already handled:** The design correctly notes that ID generation (UUID/CUID) is already implemented in the entity layer and works identically across dialects. No duplication needed.

- **Documented SQLite limitations:** The table comparing Postgres vs SQLite features (params, types, NOW(), RETURNING, etc.) is excellent reference material.

---

## LLM-Friendliness Check

The API is reasonably LLM-friendly:
- `dialect: 'sqlite'` is self-explanatory
- `d1: env.DB` is a standard Cloudflare pattern that LLMs can learn
- The dialect methods (`param()`, `now()`) have clear names

However, an LLM might not predict the boolean/timestamp conversion without being told. Adding a comment or JSDoc in the generated code ("// SQLite: booleans are stored as 0/1") would help.
