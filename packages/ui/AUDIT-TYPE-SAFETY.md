# Type Safety Audit — @vertz/ui Package

**Date:** 2026-02-21  
**Auditor:** AI Assistant  
**Scope:** `/packages/ui/src/` — Type safety deep audit

---

## Executive Summary

The `@vertz/ui` package demonstrates **strong type safety** overall. TypeScript strict mode is enabled, and the codebase makes extensive use of generics, template literal types, and type-level tests. However, several areas warrant attention, particularly around the EntityStore's use of `any` for heterogeneous entity storage and a few unsafe casts in merge utilities.

**Type Safety Grade: B+**

---

## Findings by Severity

### Critical — 0 issues

No critical type safety issues found.

---

### High — 2 issues

#### 1. EntityStore uses `Signal<any>` for heterogeneous entity storage

**File:** `src/store/entity-store.ts`  
**Lines:** 16, 220

```typescript
private _entities = new Map<string, Map<string, Signal<any>>>();

private _getOrCreateTypeMap(type: string): Map<string, Signal<any>> {
```

**Issue:** The EntityStore uses `Signal<any>` to store entities of different types in a single map. This is a legitimate typing challenge (heterogeneous collections are inherently hard to type), but `any` bypasses all type checking.

**Impact:** 
- Type information is lost when entities are stored
- `get<T>()` return type relies on the caller's generic parameter, not the actual stored type
- No compile-time protection against type mismatches (e.g., `store.get<User>('Product', '1')`)

**Recommendation:**
```typescript
// Option 1: Use a branded type for entity type names
type EntityTypeMap = {
  User: User;
  Product: Product;
  // ...
};

// Option 2: Store type information at runtime
interface EntitySignal<T> extends Signal<T | undefined> {
  __entityType: string;
}

// Option 3: Use unknown with explicit type guards
private _entities = new Map<string, Map<string, Signal<unknown>>>();
```

---

#### 2. Unsafe casts in EntityStore.hydrate()

**File:** `src/store/entity-store.ts`  
**Lines:** 204-205

```typescript
const entities = Object.values(typeEntities).map(entity => ({
  ...(entity as any),
  id: (entity as any).id
}));
```

**Issue:** Deserialized JSON is cast to `any` to extract the `id` property. This is necessary because the SerializedStore type uses `unknown` for entity values, but the cast loses type safety.

**Impact:**
- Runtime errors possible if `entity.id` doesn't exist or isn't a string
- No validation of entity shape before merging

**Recommendation:**
```typescript
// Define a base entity type with required id
interface SerializedEntity {
  id: string;
  [key: string]: unknown;
}

// Type guard for validation
function isSerializedEntity(value: unknown): value is SerializedEntity {
  return typeof value === 'object' && value !== null && 'id' in value;
}

// Then in hydrate:
for (const [type, typeEntities] of Object.entries(data.entities)) {
  const entities = Object.values(typeEntities).filter(isSerializedEntity);
  this.merge(type, entities);
}
```

---

### Medium — 3 issues

#### 3. Unsafe cast in shallowMerge()

**File:** `src/store/merge.ts`  
**Line:** 16

```typescript
(result as any)[key] = value;
```

**Issue:** The function casts the result to `any` to assign dynamic keys. This is a common pattern but loses type safety for the return value.

**Impact:**
- The return type `T` is asserted but not guaranteed
- Mutating properties via dynamic keys bypasses TypeScript's index signature checking

**Recommendation:**
```typescript
// Use a mapped type approach
export function shallowMerge<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
): T {
  const result = { ...existing };
  
  for (const key in incoming) {
    const value = incoming[key];
    if (value !== undefined) {
      // TypeScript understands this is safe for Partial<T> keys
      result[key] = value as T[typeof key];
    }
  }
  
  return result;
}
```

---

#### 4. Test utility uses `as any` for entity merging

**File:** `src/store/test-utils.ts`  
**Line:** 29

```typescript
store.merge(type, entityArray as any);
```

**Issue:** Test utility bypasses type checking when merging test entities. This is acceptable for test code but indicates friction in the EntityStore API.

**Impact:**
- Tests may pass with invalid entity types
- API friction suggests the EntityStore.merge() signature could be improved

**Recommendation:**
- Accept as test code, but consider adding a `mergeUntyped()` method for testing scenarios
- Or improve the `SerializedStore` type to include entity type information

---

#### 5. Context type erasure with `Context<unknown>`

**File:** `src/component/context.ts`  
**Lines:** 6, 22-23

```typescript
export type ContextScope = Map<Context<unknown>, unknown>;

function asKey<T>(ctx: Context<T>): Context<unknown> {
  return ctx as Context<unknown>;
}
```

**Issue:** Context values are erased to `unknown` when stored in the scope map. This is a common pattern for dependency injection containers but creates a disconnect between the typed Context<T> and the stored value.

**Impact:**
- Runtime cast required when retrieving values (`currentScope.get(key) as T`)
- No compile-time guarantee that the stored value matches the Context's type parameter

**Recommendation:**
- This is an acceptable trade-off for this pattern
- Consider documenting the invariant: "Context<T> must always store values of type T"
- The `useContext<T>` return type of `T | undefined` correctly handles the uncertainty

---

### Low — 4 issues

#### 6. JSX HTMLAttributes uses `[key: string]: unknown`

**File:** `src/jsx-runtime/index.ts`  
**Lines:** 33-36

```typescript
export interface HTMLAttributes {
  [key: string]: unknown;
  children?: unknown;
}
```

**Issue:** The index signature allows any property with any type. This is necessary for flexibility but loses type information for standard HTML attributes.

**Impact:**
- No autocomplete or type checking for HTML attributes
- Typos like `onclic` instead of `onClick` won't be caught

**Recommendation:**
- This is acceptable for a JSX runtime that supports custom attributes
- Consider adding a stricter type for known HTML attributes:
```typescript
interface HTMLAttributes<T extends HTMLElement> extends KnownAttributes<T> {
  [key: string]: unknown;
}
```

---

#### 7. Component function type uses `Record<string, unknown>`

**File:** `src/jsx-runtime/index.ts`  
**Line:** 28, 57

```typescript
export type JSXComponent = (props: Record<string, unknown>) => Element;
type JSXComponentFn = (props: Record<string, unknown>) => JSX.Element;
```

**Issue:** Component props are typed as `Record<string, unknown>`, losing prop type information.

**Impact:**
- JSX component props are not type-checked at the call site
- No autocomplete for component props

**Recommendation:**
- This is a known limitation of the current JSX runtime
- The overload signatures in `jsx()` do provide type inference for function components:
```typescript
export function jsx<P extends Record<string, unknown>, R extends JSX.Element>(
  tag: (props: P) => R,
  props: P
): R;
```

---

#### 8. Duck-typing for error handling in validation

**File:** `src/form/validation.ts`  
**Lines:** 29-31, 35-36

```typescript
const fieldErrors = (err as Error & { fieldErrors?: Record<string, string> }).fieldErrors;

const issues = (err as Error & { issues?: { path: (string | number)[]; message: string }[] })
  .issues;
```

**Issue:** Error objects are cast to check for convention-based properties (`fieldErrors`, `issues`). This is necessary for handling unknown error types but relies on runtime conventions.

**Impact:**
- No compile-time guarantee that error objects have these properties
- Changes to error shape in @vertz/schema won't be caught at compile time

**Recommendation:**
- Document the expected error interfaces:
```typescript
interface FieldErrors {
  fieldErrors?: Record<string, string>;
}

interface SchemaIssues {
  issues?: Array<{ path: (string | number)[]; message: string }>;
}

function hasFieldErrors(err: unknown): err is Error & FieldErrors {
  return err instanceof Error && 'fieldErrors' in err;
}
```

---

#### 9. isPromise type guard uses assertion

**File:** `src/component/suspense.ts`  
**Lines:** 14-18

```typescript
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}
```

**Issue:** The type guard correctly narrows the type but uses an assertion to check the `.then` property.

**Impact:**
- Minor: could use a safer check

**Recommendation:**
```typescript
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as Record<string, unknown>).then === 'function'
  );
}
```

---

## Positive Findings

### Excellent Type-Level Test Coverage

The package includes comprehensive type-level tests (`.test-d.ts` files) for:
- Signal types (`src/runtime/__tests__/signal.test-d.ts`)
- JSX types (`src/jsx-runtime/__tests__/jsx-types.test-d.ts`)
- Context types (`src/component/__tests__/context.test-d.ts`)
- CSS types (`src/css/__tests__/css.test-d.ts`)
- Variants types (`src/css/__tests__/variants.test-d.ts`)
- Form types (`src/form/__tests__/form.test-d.ts`)
- Router types (`src/router/__tests__/router.test-d.ts`)
- Query types (`src/query/__tests__/query.test-d.ts`)

### Strong Generic Type Flow

- **Signal<T>**: Clean generic parameter flow from `signal(initial)` through `computed()` to `effect()`
- **Context<T>**: Type parameter preserved through `createContext`, `Provider`, and `useContext`
- **FormInstance<TBody, TResult>**: Dual generic parameters flow correctly from SDK method through form instance
- **QueryResult<T>**: Type inference from thunk return type works correctly

### Template Literal Types for Route Params

```typescript
// src/router/params.ts
export type ExtractParams<T extends string> = ...
```

Excellent use of template literal types to extract route parameters. Type-level tests verify:
- Static paths return `Record<string, never>`
- `:param` segments produce `{ param: string }`
- Wildcards produce `{ '*': string }`

### Function Overloading for Type Safety

The JSX runtime uses function overloads to provide correct return types:

```typescript
// src/jsx-runtime/index.ts
export function jsx<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null | undefined
): HTMLElementTagNameMap[K];
```

This ensures `jsx('div', {})` returns `HTMLDivElement`, not just `HTMLElement`.

### Form Function Overloads

```typescript
// src/form/form.ts
export function form<TBody, TResult>(
  sdkMethod: SdkMethodWithMeta<TBody, TResult>,
  options?: FormOptions<TBody>,
): FormInstance<TBody, TResult>;

export function form<TBody, TResult>(
  sdkMethod: SdkMethod<TBody, TResult>,
  options: Required<Pick<FormOptions<TBody>, 'schema'>> & FormOptions<TBody>,
): FormInstance<TBody, TResult>;
```

Correctly enforces that SDK methods without `.meta.bodySchema` require an explicit schema.

### Strict TypeScript Configuration

- `strict: true` enabled
- `noUncheckedIndexedAccess: true` enabled
- `isolatedDeclarations: true` enabled (for transpile-only builds)

---

## Type Safety Metrics

| Metric | Value |
|--------|-------|
| Total `any` usages (non-test) | 5 |
| Total `@ts-ignore` usages | 0 |
| Total `@ts-expect-error` usages | 0 |
| Type-level test files | 8 |
| Generic type parameters | 15+ |
| Template literal types | 1 (ExtractParams) |
| Function overloads | 12+ |

---

## Recommendations Summary

1. **High Priority:** Address `Signal<any>` in EntityStore with a type-safe heterogeneous collection pattern
2. **Medium Priority:** Add type guards for deserialized entity validation in `hydrate()`
3. **Low Priority:** Improve type narrowing in error handling utilities
4. **Documentation:** Document invariants for Context type erasure pattern

---

## Conclusion

The `@vertz/ui` package demonstrates mature TypeScript usage with excellent type-level test coverage and strong generic type flow. The main areas for improvement are in the EntityStore's handling of heterogeneous entity types, where `any` is used to work around legitimate typing challenges. These are not bugs but design decisions that could be improved with more sophisticated type patterns.

The absence of `@ts-ignore` and `@ts-expect-error` suppressions is commendable and indicates a disciplined approach to type safety.
