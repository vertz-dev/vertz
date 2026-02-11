# db-007: Connection pool + createDb() + tenant graph

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 2: Error Hierarchy + Connection Management
- **Estimate:** 8 hours
- **Blocked by:** db-004, db-006
- **Blocks:** db-008

## Description

Implement `createDb()` client factory, connection pool lifecycle, health checks, and tenant graph computation at startup.

Reference: `plans/db-design.md` Section 1.1, 1.11; `plans/db-implementation.md` Phase 2

### createDb():
- Accepts URL, pool config, table registry, casing, log, plugins
- Returns `Database<TTables>` instance
- Initializes connection pool (wrapping `postgres` driver)

### Connection pool:
- min/max connections, idle timeout
- `db.close()` graceful shutdown
- `db.isHealthy()` health check (SELECT 1)
- Connection error recovery

### Tenant graph:
- Compute at `createDb()` time from `d.tenant()` metadata
- Traverse relations to find indirect tenant paths
- Expose as `db.$tenantGraph` with `{ root, directlyScoped, indirectlyScoped, shared }`
- Log startup notices for tables without tenant paths and not marked `.shared()`

### PGlite test infrastructure:
- Setup and teardown helpers for tests

## Acceptance Criteria

- [ ] `createDb()` returns a typed `Database<TTables>` instance
- [ ] Connection pool respects min/max/idleTimeout configuration
- [ ] `db.close()` drains pool and resolves
- [ ] `db.isHealthy()` returns true when connected, false after close
- [ ] Tenant graph correctly identifies root, directly scoped, indirectly scoped, and shared tables
- [ ] Startup notice logged for tables without tenant path and not .shared()
- [ ] PGlite test setup creates and tears down test database
- [ ] Integration test: createDb connects and computes tenant graph
- [ ] Integration test: db.close() drains gracefully

## Progress

