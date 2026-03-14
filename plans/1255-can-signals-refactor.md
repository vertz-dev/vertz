# refactor(ui): remove double-cast for can().allowed — #1255

## Problem

`createEntitlementGuard()` in `@vertz/ui-auth` uses a double-cast to access the raw signal behind `can()`:

```ts
(c.allowed as unknown as ReadonlySignal<boolean>).value
```

This violates the `no-double-cast` Biome rule and is fragile. The signal-api pattern intentionally hides signals behind plain types for user code (compiler auto-unwraps), but framework code (no compiler) needs raw signal access.

## API Surface

### New type: `RawAccessCheck`

```ts
/** @internal Signal-backed version of AccessCheck — actual runtime type of can() return. */
export interface RawAccessCheck {
  readonly allowed: ReadonlySignal<boolean>;
  readonly reasons: ReadonlySignal<DenialReason[]>;
  readonly reason: ReadonlySignal<DenialReason | undefined>;
  readonly meta: ReadonlySignal<DenialMeta | undefined>;
  readonly loading: ReadonlySignal<boolean>;
}
```

### New function: `canSignals()`

```ts
/**
 * @internal Framework use only.
 * Same as can() but returns raw ReadonlySignal properties.
 * Use when framework code needs reactive signal access without compiler transforms.
 */
export function canSignals(
  entitlement: Entitlement,
  entity?: { __access?: Record<string, AccessCheckData> },
): RawAccessCheck;
```

### Usage in `createEntitlementGuard`

```ts
// BEFORE
const checks: AccessCheck[] = requires.map((e) => can(e));
return () => checks.every((c) => (c.allowed as unknown as ReadonlySignal<boolean>).value);

// AFTER
const checks: RawAccessCheck[] = requires.map((e) => canSignals(e));
return () => checks.every((c) => c.allowed.value);
```

## Implementation

1. Add `RawAccessCheck` interface to `access-context.ts` (co-located with `canSignals()`, keeps `access-set-types.ts` free of runtime type imports)
2. Extract shared signal-creation logic from `can()` into `createAccessCheckRaw(ctx, entitlement, entity)` helper
   - **`ctx` is passed as a parameter** — `useContext()` is called by `can()`/`canSignals()`, not the helper
   - **Handles null ctx** (no-provider fallback): when `ctx` is `null`, returns the fail-secure fallback signals (current `createFallbackDenied()` logic merged into this helper)
3. `can()` calls `useContext()` + passes ctx to helper + casts result to `AccessCheck` (existing behavior)
4. New `canSignals()` calls `useContext()` + passes ctx to helper + returns `RawAccessCheck` directly (zero casts)
5. Update `createEntitlementGuard` to use `canSignals()` instead of `can()`
6. Export `canSignals` and `RawAccessCheck` from `@vertz/ui/auth`

**Important:** `canSignals()` must **NOT** be added to the compiler's signal-api-registry. It returns raw `ReadonlySignal` properties — if registered, the compiler would auto-insert `.value`, causing double-unwrap bugs.

## Manifesto Alignment

- **Signals are an implementation detail**: `can()` stays unchanged for users. `canSignals()` is `@internal`.
- **No magic**: Framework code gets clean typed access instead of brittle double-casts.

## Non-Goals

- Changing `can()` public API
- Generalizing this pattern for all signal-apis (query, form) — only `can()` needs it today
- Removing the `as unknown as AccessCheck` cast in `can()` — that cast is correct and intentional
- Adding `canSignals()` to the signal-api-registry — it returns raw signals, compiler must NOT auto-unwrap

## Unknowns

None identified.

## Type Flow Map

```
canSignals(entitlement)
  → createAccessCheckRaw(ctx, entitlement)
    → { allowed: ReadonlySignal<boolean>, ... }  (RawAccessCheck)
      → createEntitlementGuard reads .allowed.value  (boolean)
```

No dead generics — `RawAccessCheck` maps 1:1 to `AccessCheck` property types wrapped in `ReadonlySignal`.

## E2E Acceptance Test

```ts
// createEntitlementGuard returns a reactive function using canSignals()
describe('Given canSignals() returns raw signal properties', () => {
  describe('When createEntitlementGuard reads .allowed.value', () => {
    it('Then returns boolean without double-casting', () => {
      // Existing tests cover behavior — this refactor changes types, not behavior
    });
  });
});

// @ts-expect-error: canSignals() returns ReadonlySignal, not plain boolean
const bad: boolean = canSignals('test').allowed; // Type error — it's ReadonlySignal<boolean>
```
