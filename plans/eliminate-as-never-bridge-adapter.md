# Eliminate `as never` Casts in Database Bridge Adapter

**Issue:** [#1150](https://github.com/vertz-dev/vertz/issues/1150)

## API Surface

No public API changes. `createDatabaseBridgeAdapter` signature and `EntityDbAdapter` interface are unchanged. This is an internal type safety improvement.

```typescript
// Unchanged external signature
function createDatabaseBridgeAdapter<
  TModels extends Record<string, ModelEntry>,
  TName extends keyof TModels & string,
>(db: DatabaseClient<TModels>, tableName: TName): EntityDbAdapter<TModels[TName]>;
```

## Root Cause

The `ModelDelegate<TEntry>` methods use bounded generics with deferred conditional types:

```typescript
get<TOptions extends TypedGetOptions<TEntry>>(options?: TOptions): Promise<Result<FindResult<...>, ReadError>>;
```

When `TEntry` is generic (not a concrete type), TypeScript can't evaluate `FilterType<EntryColumns<TEntry>>`, so constructing `{ where: { id } }` isn't provably assignable. The bridge currently uses `as never` to escape.

## Approach: `BridgeDelegate` Interface

Define a file-local `BridgeDelegate` interface that describes the exact subset of `ModelDelegate` the bridge uses, with widened input types that accept the structural shapes the bridge constructs.

```typescript
/**
 * Narrowed view of ModelDelegate for bridge adapter use.
 * Widens input types to accept the structural shapes the bridge constructs,
 * avoiding deferred conditional types that can't be evaluated generically.
 */
interface BridgeDelegate {
  get(options?: {
    readonly where?: Record<string, unknown>;
    readonly include?: Record<string, unknown>;
  }): Promise<Result<unknown, ReadError>>;

  listAndCount(options?: {
    readonly where?: Record<string, unknown>;
    readonly orderBy?: Record<string, unknown>;
    readonly limit?: number;
    readonly include?: Record<string, unknown>;
  }): Promise<Result<unknown, ReadError>>;

  create(options: {
    readonly data: unknown;
  }): Promise<Result<unknown, WriteError>>;

  update(options: {
    readonly where: Record<string, unknown>;
    readonly data: unknown;
  }): Promise<Result<unknown, WriteError>>;

  delete(options: {
    readonly where: Record<string, unknown>;
  }): Promise<Result<unknown, WriteError>>;
}
```

The delegate is narrowed **once** at the top:

```typescript
const delegate = db[tableName] as BridgeDelegate;
```

### Why this is safe

1. **Runtime match**: The `createDb` implementation builds delegates with `(opts?: Record<string, unknown>) => implXxx(name, opts)` — all methods accept `Record<string, unknown>` at runtime.
2. **Structural supertype**: `BridgeDelegate`'s input types are all supertypes of `ModelDelegate`'s typed inputs (wider `Record<string, unknown>` vs narrower `FilterType<...>`).
3. **Return types**: `unknown` is a supertype of any `FindResult<...>`, so return type covariance holds.
4. **No consumer impact**: The existing `as TResponse` return casts (already present) narrow the `unknown` back to the correct type.

### What changes

| Before | After |
|--------|-------|
| 5× `as never` per-call casts | 1× `as BridgeDelegate` at delegate binding |
| `Record<string, unknown>` intermediate variables | Direct object literals |
| Opaque type escape | Documented structural contract |

### Return type casts

The existing `as TResponse` return casts remain — they correctly narrow `FindResult` (which includes select/include narrowing) to `$response` (full response). These are out of scope per the issue (only the 5 input `as never` casts are targeted).

## Alternatives Considered

### 1. Zero-cast solution via structural subtyping

Have `ModelDelegate<TEntry>` be a structural subtype of `BridgeDelegate` so no cast is needed. Blocked by:
- `ModelDelegate` methods are bounded generics (`<TOptions extends ...>`), not simple parameters
- TypeScript can't verify generic method compatibility with non-generic methods for deferred types

### 2. Per-call `as TypedGetOptions<TEntry>` casts

Replace each `as never` with the specific option type. Blocked by:
- `TypedGetOptions` etc. are file-local to `database.ts` (not exported)
- Even if exported, `{ id: string }` isn't assignable to `FilterType<EntryColumns<TEntry>>` for generic TEntry
- Results in 5 specific casts instead of 5 `as never` — marginal improvement

### 3. Modify `ModelDelegate` to accept wider types

Add overloads or widen parameter types. Rejected:
- Pollutes the public API for one internal consumer
- Weakens type safety for all external callers

## Manifesto Alignment

- **Type safety**: Replaces total type escape (`as never`) with a narrow, documented assertion
- **Transparency**: `BridgeDelegate` documents exactly what the bridge needs from the delegate

## Non-Goals

- Eliminating return-type casts (`as TResponse`) — already correct and out of scope
- Modifying `ModelDelegate` or any public type
- Achieving zero casts — one structural cast replacing five escape hatches is the target

## Unknowns

- **`as BridgeDelegate` vs `as unknown as BridgeDelegate`**: TypeScript's `as` assertion requires "sufficient overlap" between source and target types. `ModelDelegate<TEntry>` and `BridgeDelegate` share method names with compatible (wider) signatures, so `as BridgeDelegate` should work directly. If TypeScript rejects it due to generic-vs-non-generic method signature overlap resolution, fall back to `as unknown as BridgeDelegate` with a code comment explaining why. Either form is acceptable — both are a single documented assertion replacing five `as never` escapes.

## Type Flow Map

```
EntityDbAdapter<TEntry>
  ├── get(id, opts?)
  │     └── BridgeDelegate.get({ where: { id }, include? })
  │           └── Result<unknown> → as TResponse | null
  ├── list(opts?)
  │     └── BridgeDelegate.listAndCount({ where?, orderBy?, limit?, include? })
  │           └── Result<unknown> → as { data: TResponse[]; total }
  ├── create(data)
  │     └── BridgeDelegate.create({ data })
  │           └── Result<unknown> → as TResponse
  ├── update(id, data)
  │     └── BridgeDelegate.update({ where: { id }, data })
  │           └── Result<unknown> → as TResponse
  └── delete(id)
        └── BridgeDelegate.delete({ where: { id } })
              └── Result<unknown> → as TResponse | null
```

## E2E Acceptance Test

```typescript
// Type-level: bridge adapter preserves typed responses
describe('Feature: database bridge adapter type safety', () => {
  describe('Given a DatabaseClient with typed models', () => {
    describe('When creating a bridge adapter for a table', () => {
      it('Then get() returns the correct response type or null', () => {
        // expectTypeOf(adapter.get('id')).resolves.toEqualTypeOf<TaskResponse | null>();
      });
      it('Then list() returns typed array with total', () => {
        // expectTypeOf(adapter.list()).resolves.toEqualTypeOf<{ data: TaskResponse[]; total: number }>();
      });
      it('Then create() accepts create input and returns response type', () => {});
      it('Then update() accepts update input and returns response type', () => {});
      it('Then delete() returns the correct response type or null', () => {});
    });
  });
});

// Runtime: all existing 7 tests pass unchanged
```

## Implementation Plan

### Phase 1: Replace casts and add type tests

Single phase — the change is contained to one file plus a new type test file.

**Steps:**
1. Add `BridgeDelegate` interface to `database-bridge-adapter.ts`
2. Replace `const delegate = db[tableName]` with `const delegate = db[tableName] as BridgeDelegate`
3. Remove all 5 `as never` input casts
4. Simplify option construction (remove `Record<string, unknown>` intermediates, use direct object literals)
5. Add `.test-d.ts` type-level tests verifying the adapter's typed responses
6. Verify all existing tests pass

**Acceptance criteria:**
- [ ] Zero `as never` casts in `database-bridge-adapter.ts`
- [ ] Zero `as any` casts introduced
- [ ] `BridgeDelegate` interface documents the structural contract
- [ ] Type-level tests verify adapter returns correctly typed data
- [ ] All 7 existing bridge adapter tests pass
- [ ] `bun test`, `bun run typecheck`, `bun run lint` clean
