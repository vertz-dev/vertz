# @vertz/db — Priority Bug Fixes

- **Status:** 🔴 Todo
- **Assigned:** ben (tech lead)
- **Priority:** High — broken code slows us down
- **Phase:** Immediate

## Bugs (fix ASAP)

### GH #203 — isHealthy() hangs forever
No timeout. If DB unreachable, health check blocks indefinitely. Add configurable timeout (default 5s).

### GH #205 — db.query() bypasses error mapping
Raw SQL escape hatch doesn't route through executeQuery. Postgres errors leak as raw driver errors.

### GH #206 — No default idle_timeout for connection pool
Idle connections may never be released. Set sensible default (e.g., 30s).

## Lower Priority

### GH #204 — Document timestamp coercion risk
Not a bug, needs docs. Assign to josh when he has bandwidth.

### GH #207 — Integration test isolation
Test quality improvement. Not user-facing.
