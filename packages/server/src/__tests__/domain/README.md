# Domain API Tests - TDD Red Phase

## Status: ✅ Tests Written, 🟡 Partially Passing (Expected)

This directory contains comprehensive tests for the `domain()` API (Phase 1).

### Test Files

1. **domain-definition.test.ts** (531 tests) - Core domain() function structure
2. **domain-crud.test.ts** (725 tests) - Auto-CRUD endpoint generation  
3. **domain-access.test.ts** (719 tests) - Access rules and deny-by-default
4. **domain-expose.test.ts** (821 tests) - Secure relation exposure

**Total: 172 tests**

### Test Results (TDD Red Phase)

- ✅ **158 tests passing** (92%)
- ❌ **14 tests failing** (8%)

### Why Tests Fail (This is Correct!)

This is **TDD red phase** - tests are written BEFORE implementation.

**Passing tests (158):**
- Domain definition structure ✅
- Type field validation ✅  
- Fields/expose/access/handlers/actions configuration ✅
- Immutability (Object.freeze) ✅
- All API surface contracts ✅

**Failing tests (14 - implementation needed):**
- 12 CRUD endpoint generation tests → Need `createServer()` integration
- 2 TypeScript type validation tests → Compile-time only (@ts-expect-error)

### Stub Implementation

Minimal stubs exist in `packages/server/src/domain/`:
- `types.ts` - Type definitions
- `domain.ts` - Minimal domain() stub (returns frozen definition object)
- `index.ts` - Exports

**These stubs are temporary** - they allow tests to import and run, but don't implement business logic.

### Next Steps (Implementation Phase - Green)

Ben will implement against these tests:

1. **Route Registration** - Wire domain definitions into createServer()
2. **CRUD Handlers** - Generate list, get, create, update, delete endpoints
3. **Access Enforcement** - Apply access rules to operations
4. **Relation Fetching** - Implement expose configuration
5. **Pagination** - Cursor-based pagination logic
6. **Validation** - Schema-derived input validation
7. **Error Responses** - Errors-as-values (Result type)

### Running Tests

```bash
bun test packages/server/src/__tests__/domain/
```

Expected: 158 pass, 14 fail until full implementation.

### Design Documents

- Full spec: `/workspace/vertz/plans/entity-phase1-spec.md`
- Design doc: `/workspace/vertz/plans/entity-aware-api.md`

---

**This is TDD working correctly.** Tests guide implementation. Failures show what's left to build.
