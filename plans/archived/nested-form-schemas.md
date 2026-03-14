# Nested Object Schemas and Dynamic Field Access for form()

**Issue:** #530
**Status:** Draft (Rev 2 — addresses DX, Product, and Technical review feedback)
**Parent:** form() API redesign (#527, PR #523)
**Deferred from:** `plans/form-attrs-api-improvement.md` Section 7C

---

## 1. API Surface

### 1A. Nested Object Schemas

Given a nested schema:

```ts
import { s } from '@vertz/schema';

const createUserSchema = s.object({
  name: s.string().min(1),
  address: s.object({
    street: s.string().min(1),
    city: s.string().min(1),
    zip: s.string().length(5),
  }),
});

type CreateUserBody = {
  name: string;
  address: {
    street: string;
    city: string;
    zip: string;
  };
};
```

Usage in a component:

```tsx
const userForm = form(userApi.create, { schema: createUserSchema });

return (
  <form action={userForm.action} method={userForm.method} onSubmit={userForm.onSubmit}>
    <input name="name" />
    {userForm.name.error && <span>{userForm.name.error}</span>}

    {/* Nested field access — 4-level chain */}
    <input name="address.street" />
    {userForm.address.street.error && <span>{userForm.address.street.error}</span>}

    <input name="address.city" />
    {userForm.address.city.error && <span>{userForm.address.city.error}</span>}

    <input name="address.zip" />
    {userForm.address.zip.error && <span>{userForm.address.zip.error}</span>}

    <button type="submit" disabled={userForm.submitting}>Submit</button>
  </form>
);
```

**Key behaviors:**

- `userForm.address.street` navigates to the `address.street` field via a chain proxy
- `userForm.address.street.error` returns the error signal for field key `"address.street"`
- `userForm.address.error` returns the error signal for the group-level field key `"address"` (useful for server-side group-level validation errors). **Important:** this is a simple FieldState for the `"address"` path, NOT a computed aggregate of child errors. If the schema validator reports a group-level error (e.g., `{ path: ['address'], message: 'Invalid address' }`), it appears here. Individual field errors (e.g., `address.street`) must be accessed at their own path. See "Group-Level vs. Leaf-Level Clarity" in Section 2.
- Input `name` attributes use dot notation: `"address.street"`, `"address.city"`
- `formDataToObject()` parses dot-path keys into nested objects when `nested: true` is passed: `{ address: { street: "...", city: "..." } }`. The form submit pipeline passes `nested: true` automatically.
- Arbitrary nesting depth is supported: `form.a.b.c.d.error` works

### 1B. Dynamic Field Access (Bracket Notation)

```tsx
function DynamicField({ fieldName }: { fieldName: string }) {
  const taskForm = form(taskApi.create, { schema });

  // Bracket notation — compiler transforms .error to .error.value
  return (
    <div>
      {taskForm[fieldName].error && <span>{taskForm[fieldName].error}</span>}
    </div>
  );
}
```

The compiler handles `ElementAccessExpression` as an intermediate chain step. When the leaf property is a `fieldSignalProperty`, `.value` is appended.

### 1C. Field Arrays

```tsx
const orderSchema = s.object({
  items: s.array(s.object({
    product: s.string(),
    quantity: s.number(),
  })),
});

type OrderBody = {
  items: Array<{ product: string; quantity: number }>;
};

const orderForm = form(orderApi.create, { schema: orderSchema });

// Indexed access — numeric path segments
<input name="items.0.product" />
{orderForm.items[0].product.error && <span>{orderForm.items[0].product.error}</span>}

<input name="items.1.product" />
{orderForm.items[1].product.error && <span>{orderForm.items[1].product.error}</span>}
```

Array items use numeric indices in the dot-path: `"items.0.product"`. `formDataToObject()` recognizes numeric path segments and creates arrays.

**Note:** This phase provides indexed access to array item fields. Dynamic add/remove helpers (e.g., `orderForm.items.push()`, `orderForm.items.remove(idx)`) and iteration (`orderForm.items.map(...)`) are deferred — see Non-Goals. Without those helpers, array field indexed access is primarily useful for forms with a known, fixed number of items (e.g., a 3-address form). The real user-facing payoff for dynamic arrays lands in the follow-up issue for array helpers.

### 1D. Input Name Convention

For nested fields, use dot-notation string literals for input `name` attributes:

```tsx
// Flat (existing — fields proxy still works for flat fields)
<input name={userForm.fields.name} />  // "name"

// Nested — use string literals with dot notation
<input name="address.street" />
<input name="address.city" />

// Array — use template literals for dynamic indices
<input name={`items.${i}.product`} />
```

The existing `fields` proxy continues to work for flat field names. Extending the `fields` proxy to nested schemas (returning chain proxies with `Symbol.toPrimitive` coercion) is deferred — the interaction between Proxy string coercion and JSX attribute assignment is fragile and not all JSX runtimes handle it consistently. String literals with dot notation are explicit, simple, and work everywhere.

### 1E. Initial Values for Nested Fields

```tsx
const userForm = form(userApi.create, {
  schema: createUserSchema,
  initial: {
    name: 'Alice',
    address: { city: 'Springfield' },  // partial — only city, street/zip default to undefined
  },
});
```

The `initial` option type changes from `Partial<TBody>` to `DeepPartial<TBody>` (recursive partial). This allows providing partial initial values at any nesting depth — developers don't need to provide every nested field. When a nested field is accessed, the initial value is resolved by traversing the nested object using the dot-path segments.

### 1F. `setFieldError` with Dot-Path Support

```tsx
// Flat (existing)
userForm.setFieldError('name', 'Name is required');

// Nested (new) — accepts dot-path strings
userForm.setFieldError('address.street', 'Street is required');
userForm.setFieldError('address', 'Invalid address');  // group-level error
```

The `setFieldError` signature changes from `(field: keyof TBody & string, message: string)` to `(field: FieldPath<TBody>, message: string)` where `FieldPath<TBody>` is a union of all valid dot-paths through the nested type (e.g., `"name" | "address" | "address.street" | "address.city" | "address.zip"`).

---

## 2. Manifesto Alignment

### Principles Applied

1. **If it builds, it works** — Recursive `FieldAccessors<T>` type ensures nested field paths are compile-time checked. Accessing `userForm.address.nonexistent.error` is a type error. Reserved field signal names (`error`, `dirty`, `touched`, `value`) are guarded at each nesting level.

2. **One way to do things** — Nested fields use the same pattern as flat fields: `form.field.signal`. The nesting just adds more segments. No alternate API (`form.getField('address.street')`) — one access pattern for all depths.

3. **AI agents are first-class users** — The nested pattern is predictable: `form.<path>.<signal>`. An LLM that understands flat form access immediately understands nested form access. Dot-path input names (`"address.street"`) follow the same convention.

4. **Performance is not optional** — Chain proxies are lazy. No upfront field creation for every possible nested path. Fields are created on first access, same as flat fields.

### Tradeoffs

- **Explicit over implicit** — Dot-path input names make the nesting structure visible in HTML. No magic transformation of bracket notation in names.
- **Convention over configuration** — Dot notation is the only path separator. No support for bracket notation in input names (`address[street]`) — one convention.

### Group-Level vs. Leaf-Level Clarity

A critical DX distinction: `userForm.address.error` and `userForm.address.street.error` refer to different fields.

- `userForm.address.error` → FieldState for path `"address"` (group-level). Only populated if the validator explicitly reports an error at the `address` path, or if the developer calls `setFieldError('address', '...')`.
- `userForm.address.street.error` → FieldState for path `"address.street"` (leaf-level). Populated by validation errors at `['address', 'street']`.

`userForm.address.error` is NOT a computed aggregate of child errors. To check if any child field has an error, use the form-level `valid` signal (`userForm.valid`) or check each child individually.

### What Was Rejected

- **Nested `fields` proxy with `Symbol.toPrimitive` coercion** — Considered making `userForm.fields.address.street` return a chainable Proxy that coerces to `"address.street"` via `Symbol.toPrimitive`. Rejected because JSX attribute assignment behavior with Proxy objects varies across runtimes — some use property assignment (`el.name = value`), others use `setAttribute`. String coercion is not guaranteed. Developers use dot-notation string literals instead.
- **Group-level computed aggregates** — Considered `userForm.address.dirty` returning a computed signal that aggregates all child field dirty states. Rejected for v1 — adds complexity with unclear use cases. Group-level `error`/`dirty`/`touched`/`value` create a simple FieldState for the group path, same as any other field.
- **Bracket notation in input names** — Considered `address[street]` (Rails/PHP style). Rejected — dot notation is simpler, consistent with `@vertz/schema` error paths (`issue.path.join('.')`), and more JS-idiomatic.

---

## 3. Non-Goals

- **Dynamic array helpers** — `form.items.push()`, `form.items.remove(idx)`, `form.items.length`, `form.items.map(...)`. These require array-aware proxies with mutation tracking. Deferred to a follow-up issue.
- **Computed group aggregates** — `form.address.dirty` automatically computing from child fields. Deferred — simple FieldState per path is sufficient for v1.
- **Nested `fields` proxy** — `fields.address.street` returning `"address.street"` via chain proxy with string coercion. Deferred due to fragile `Symbol.toPrimitive` interaction with JSX attribute assignment. Developers use dot-notation string literals for nested input names.
- **Reactive initial values** — Already deferred in Section 7B of the parent design doc.
- **File upload fields** — `formDataToObject()` already skips File entries. Nested file fields are out of scope.
- **Deep validation error mapping** — The existing `validation.ts` already joins issue paths with `.` (`issue.path.join('.')`). No changes needed to the validation module.

---

## 4. Unknowns

### Resolved

1. **Can `formDataToObject()` reliably distinguish array indices from object keys?**
   - Resolution: Numeric path segments are array indices. `"items.0.product"` → `{ items: [{ product: "..." }] }`. Non-numeric segments are object keys. This matches `@vertz/schema`'s path convention where array indices are numbers in the `issue.path` array.

2. **Does the existing `validation.ts` need changes?**
   - Resolution: No. It already does `issue.path.join('.')` to create field keys. Nested errors like `['address', 'street']` → `'address.street'` already work. The runtime stores fields with dot-path keys, so validation error mapping works unchanged.

3. **Will N-level compiler chain support conflict with the existing 2-pass approach?**
   - Resolution: The N-level approach replaces Pass 1 (3-level). It walks from any `PropertyAccessExpression` upward through the chain, checking if the root is a signal API var and the leaf is a `fieldSignalProperty`. Pass 2 (2-level signal API properties) remains unchanged. The skip-range mechanism still prevents double-transformation. **Critical constraint:** N-level field chains require **chain length >= 3** (at least one intermediate between root and leaf). Without this, `taskForm.dirty` (2-level) would be matched by both Pass 1 (as a field chain) and Pass 2 (as a signal property), with correctness depending on accidental range-skip mechanics.

4. **Is `formDataToObject()` dot-path parsing a breaking change?**
   - Resolution: Yes — a flat key like `"file.name"` would be parsed into `{ file: { name: "..." } }` instead of `{ "file.name": "..." }`. Mitigation: make nested parsing opt-in via `formDataToObject(fd, { nested: true })`. The form submit pipeline always passes `{ nested: true }`. External callers retain backward compatibility.

5. **Will `NestedFieldAccessors<T>` hit TypeScript recursion limits?**
   - Resolution: TypeScript supports ~50 levels of conditional type recursion. Typical form nesting is 2-4 levels, well within limits. **Critical:** Arrays and built-in objects (`Date`, `RegExp`, `File`, `Blob`) must be special-cased to prevent infinite recursion into prototype members. See Type Flow Map for `ArrayFieldAccessors` definition and built-in guards.

6. **Does destructuring or aliasing break the compiler chain detection?**
   - Resolution: Yes — this is a known and accepted limitation. `const addr = form.address; addr.street.error` won't transform because `addr` is not registered as a signal API var. This is consistent with how the compiler works today (single-pass, no cross-statement data flow analysis). Documented as a known limitation.

### Open — None identified

All unknowns were resolvable through code analysis. No POC needed.

---

## 5. POC Results

No POC needed. The design is a natural extension of the existing form() architecture:
- Proxy-based field access already works — extending to chain proxies is straightforward
- `@vertz/schema` already produces nested error paths
- `validation.ts` already joins paths with `.`
- The compiler's chain detection is a generalization of existing 3-level logic

---

## 6. Type Flow Map

### Concrete Type Definitions

```ts
/** Built-in object types that should NOT recurse into NestedFieldAccessors. */
type BuiltInObjects = Date | RegExp | File | Blob | Map<unknown, unknown> | Set<unknown>;

/** Recursive field accessors for nested schemas. */
type NestedFieldAccessors<T> = {
  [K in keyof T]: T[K] extends BuiltInObjects
    ? FieldState<T[K]>                                          // Built-in → leaf
    : T[K] extends Array<infer U>
      ? FieldState<T[K]> & ArrayFieldAccessors<U>               // Array → indexed access
      : T[K] extends Record<string, unknown>
        ? HasReservedFieldName<T[K]> extends true
          ? { __error: `Nested field name conflicts with FieldState property: ${ReservedFieldName<T[K]>}` }
          : FieldState<T[K]> & NestedFieldAccessors<T[K]>       // Object → recurse
        : FieldState<T[K]>                                      // Primitive → leaf
};

/** Array field accessors — numeric index access to element-level fields. */
type ArrayFieldAccessors<U> = {
  [index: number]: U extends BuiltInObjects
    ? FieldState<U>
    : U extends Record<string, unknown>
      ? FieldState<U> & NestedFieldAccessors<U>
      : FieldState<U>
};

/** Check if any key of T collides with FieldState signal property names. */
type FieldSignalReservedNames = 'error' | 'dirty' | 'touched' | 'value' | 'setValue' | 'reset';
type HasReservedFieldName<T> = keyof T & FieldSignalReservedNames extends never ? false : true;
type ReservedFieldName<T> = keyof T & FieldSignalReservedNames & string;

/** Deep partial utility for initial values. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]>
      : T[K]
};

/** Union of all valid dot-paths through a nested type. */
type FieldPath<T, Prefix extends string = ''> =
  | `${Prefix}${keyof T & string}`
  | {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? FieldPath<T[K], `${Prefix}${K}.`>
        : never
    }[keyof T & string];
```

### Nested FieldAccessors Example

```
TBody = { name: string; address: { street: string; city: string } }

FormInstance<TBody, TResult>
  = FormBaseProperties<TBody> & NestedFieldAccessors<TBody>

NestedFieldAccessors<TBody>
  → .name: FieldState<string>
      → .error: Signal<string | undefined>
      → .dirty: Signal<boolean>
      → .touched: Signal<boolean>
      → .value: Signal<string>
  → .address: FieldState<{ street: string; city: string }> & NestedFieldAccessors<{ street: string; city: string }>
      → .error: Signal<string | undefined>       ← group-level error (NOT aggregated)
      → .dirty: Signal<boolean>                   ← group-level dirty (NOT aggregated)
      → .street: FieldState<string>
          → .error: Signal<string | undefined>
          → .value: Signal<string>
      → .city: FieldState<string>
          → .error: Signal<string | undefined>
          → .value: Signal<string>
```

### Array FieldAccessors Example

```
TBody = { items: Array<{ product: string; quantity: number }> }

NestedFieldAccessors<TBody>
  → .items: FieldState<Array<...>> & ArrayFieldAccessors<{ product: string; quantity: number }>
      → [0]: FieldState<{ product: string; quantity: number }> & NestedFieldAccessors<...>
          → .product: FieldState<string>
              → .error: Signal<string | undefined>
          → .quantity: FieldState<number>
              → .error: Signal<string | undefined>
      → [1]: ...
```

### Reserved Name Guard (per nesting level)

```
type FieldSignalReservedNames = 'error' | 'dirty' | 'touched' | 'value' | 'setValue' | 'reset';

// If a nested object has a field named 'error', 'dirty', 'touched', or 'value':
TBody = { meta: { error: string; name: string } }

NestedFieldAccessors<TBody>
  → .meta: { __error: "Nested field name 'error' conflicts with FieldState property" }
```

This is a compile-time guard. The type produces an error object instead of valid accessors when a nested field name collides with FieldState signal property names.

### Type Flow Paths Requiring Tests

1. `TBody` with nested object → `NestedFieldAccessors` resolves nested `FieldState` types
2. `TBody[K]` where K is a nested object → intermediate provides both FieldState AND deeper access
3. `TBody[K]` where K is a primitive → terminal FieldState only
4. `TBody` with field named `error`/`dirty`/`touched`/`value` inside a nested group → type error
5. `TBody` with array field → indexed access returns element-level `NestedFieldAccessors`
6. `TBody` with `Date` field → leaf FieldState (no recursion into Date prototype)
7. `DeepPartial<TBody>` allows partial nested initial values
8. `FieldPath<TBody>` produces union of all valid dot-paths
9. `setFieldError` accepts `FieldPath<TBody>` strings

---

## 7. E2E Acceptance Test

### Developer Walkthrough — Nested Object Schema

```ts
import { form, type FormInstance } from '@vertz/ui/form';
import { s } from '@vertz/schema';

// 1. Define a nested schema
const userSchema = s.object({
  name: s.string().min(1),
  address: s.object({
    street: s.string().min(1),
    city: s.string().min(1),
  }),
});

type UserBody = { name: string; address: { street: string; city: string } };

const mockSdk = Object.assign(
  (_body: UserBody) => Promise.resolve({ ok: true as const, data: { id: '1' } }),
  { url: '/users', method: 'POST' as const },
);

const userForm = form(mockSdk, { schema: userSchema });

// 2. Flat field access still works
expect(userForm.name.error.value).toBeUndefined();
userForm.name.error.value = 'Name is required';
expect(userForm.name.error.value).toBe('Name is required');

// 3. Nested field access works
expect(userForm.address.street.error.value).toBeUndefined();
userForm.address.street.error.value = 'Street is required';
expect(userForm.address.street.error.value).toBe('Street is required');

// 4. Nested fields are cached (same object identity)
const streetField1 = userForm.address.street;
const streetField2 = userForm.address.street;
expect(streetField1).toBe(streetField2);

// 5. Group-level field state works
userForm.address.error.value = 'Invalid address';
expect(userForm.address.error.value).toBe('Invalid address');

// 6. Validation populates nested errors via dot-path keys
const formData = new FormData();
formData.set('name', '');
formData.set('address.street', '');
formData.set('address.city', '');
await userForm.submit(formData);
expect(userForm.name.error.value).toBeDefined();
expect(userForm.address.street.error.value).toBeDefined();

// 7. formDataToObject parses dot-paths into nested objects (opt-in)
import { formDataToObject } from '@vertz/ui/form';
const fd = new FormData();
fd.set('name', 'Alice');
fd.set('address.street', '123 Main');
fd.set('address.city', 'Springfield');
const obj = formDataToObject(fd, { nested: true });
expect(obj).toEqual({ name: 'Alice', address: { street: '123 Main', city: 'Springfield' } });

// 7b. formDataToObject without nested: true preserves flat keys (backward compat)
const flatObj = formDataToObject(fd);
expect(flatObj).toEqual({ name: 'Alice', 'address.street': '123 Main', 'address.city': 'Springfield' });

// 8. setFieldError accepts dot-path strings
userForm.setFieldError('address.street', 'Street is required');
expect(userForm.address.street.error.value).toBe('Street is required');
userForm.setFieldError('address', 'Invalid address');
expect(userForm.address.error.value).toBe('Invalid address');

// 9. DeepPartial initial values — can provide partial nested values
const partialForm = form(mockSdk, {
  schema: userSchema,
  initial: { address: { city: 'Springfield' } },  // only city, no name/street
});
expect(partialForm.address.city.value.value).toBe('Springfield');
expect(partialForm.address.street.value.value).toBeUndefined();

// 10. Type safety — invalid nested paths are type errors
// @ts-expect-error — 'nonexistent' is not a key of address
userForm.address.nonexistent;
```

### Developer Walkthrough — Dynamic Field Access

```ts
// Bracket notation field access
const fieldName = 'title';
expect(taskForm[fieldName].error.value).toBeUndefined();
taskForm[fieldName].error.value = 'Required';
expect(taskForm[fieldName].error.value).toBe('Required');
```

### Developer Walkthrough — Array Fields

```ts
const orderSchema = s.object({
  items: s.array(s.object({
    product: s.string().min(1),
    quantity: s.number(),
  })),
});

type OrderBody = { items: Array<{ product: string; quantity: number }> };

const orderForm = form(orderSdk, { schema: orderSchema });

// Indexed array field access
expect(orderForm.items[0].product.error.value).toBeUndefined();
orderForm.items[0].product.error.value = 'Product required';
expect(orderForm.items[0].product.error.value).toBe('Product required');

// formDataToObject parses numeric indices as array elements
const fd = new FormData();
fd.set('items.0.product', 'Widget');
fd.set('items.0.quantity', '5');
fd.set('items.1.product', 'Gadget');
fd.set('items.1.quantity', '3');
const obj = formDataToObject(fd, { nested: true });
expect(obj).toEqual({
  items: [
    { product: 'Widget', quantity: '5' },
    { product: 'Gadget', quantity: '3' },
  ],
});
```

---

## 8. Implementation Plan

### Phase 1: formDataToObject Dot-Path Parsing

**Goal:** `formDataToObject()` gains an opt-in `nested: true` option that parses dot-notation keys into nested objects, with numeric segments creating arrays. Without `nested: true`, behavior is unchanged (backward compatible).

**Acceptance Criteria:**

```typescript
describe('Feature: formDataToObject dot-path parsing', () => {
  describe('Given FormData with dot-separated keys and nested: true', () => {
    describe('When formDataToObject() is called', () => {
      it('Then parses "address.street" into { address: { street: value } }', () => {});
      it('Then parses multiple nested keys into the same parent object', () => {});
      it('Then handles deeply nested paths (3+ levels)', () => {});
    });
  });

  describe('Given FormData with numeric path segments and nested: true', () => {
    describe('When formDataToObject() is called', () => {
      it('Then creates arrays for numeric indices: "items.0.name" → { items: [{ name: value }] }', () => {});
      it('Then passes sparse indices through as-is (holes are undefined)', () => {});
      it('Then handles mixed object and array nesting', () => {});
    });
  });

  describe('Given FormData with flat keys (backward compatibility)', () => {
    describe('When formDataToObject() is called without nested option', () => {
      it('Then keys with dots are preserved as flat keys (no parsing)', () => {});
      it('Then existing flat behavior is unchanged', () => {});
      it('Then coercion still works independently of nested option', () => {});
    });
  });
});
```

**Sparse array note:** Sparse indices (e.g., `items.0` and `items.5` with no items.1-4) create arrays with `undefined` holes. This is passed through as-is — schema validation catches invalid shapes. Compacting arrays is not done because it would silently reorder data.

**Files changed:**
- `packages/ui/src/form/form-data.ts` — add `nested` option to `FormDataOptions`, add `setNestedValue()` helper, update `formDataToObject()`
- `packages/ui/src/form/__tests__/form-data.test.ts` — new test cases

### Phase 2: Runtime Chain Proxy for Nested Field Access

**Goal:** `form()` returns a proxy that supports N-level field access. `userForm.address.street` navigates to field `"address.street"`. Accessing a `fieldSignalProperty` (`error`, `dirty`, `touched`, `value`) on any chain proxy resolves to the FieldState for that dot-path. Chain proxies are cached for identity stability.

**Acceptance Criteria:**

```typescript
describe('Feature: nested field access via chain proxy', () => {
  describe('Given a form with a nested schema', () => {
    describe('When accessing a nested field path', () => {
      it('Then userForm.address.street returns a field accessor', () => {});
      it('Then userForm.address.street.error is a signal', () => {});
      it('Then userForm.address.street.error.value is undefined initially', () => {});
      it('Then setting userForm.address.street.error.value updates the signal', () => {});
    });

    describe('When accessing the same nested path twice', () => {
      it('Then returns the same chain proxy object (cached identity)', () => {});
      it('Then the underlying FieldState is the same object', () => {});
    });

    describe('When accessing a group-level field state', () => {
      it('Then userForm.address.error returns a signal for the "address" path', () => {});
    });
  });

  describe('Given a form with flat fields', () => {
    describe('When accessing flat fields', () => {
      it('Then existing flat field access still works unchanged', () => {});
      it('Then form-level signals (submitting, dirty, valid) still work', () => {});
      it('Then form-level plain properties (action, method) still work', () => {});
    });
  });

  describe('Given a form with nested initial values (DeepPartial)', () => {
    describe('When a nested field is first accessed', () => {
      it('Then the field value signal is initialized from the nested initial object', () => {});
      it('Then missing nested initial values default to undefined', () => {});
    });
  });

  describe('Given validation errors with dot-path keys', () => {
    describe('When validation fails on nested fields', () => {
      it('Then errors are set on the correct nested field states', () => {});
    });
  });

  describe('Given setFieldError with dot-path strings', () => {
    describe('When setting errors on nested fields', () => {
      it('Then setFieldError("address.street", msg) sets the nested field error', () => {});
      it('Then setFieldError("address", msg) sets the group-level error', () => {});
    });
  });
});
```

**Files changed:**
- `packages/ui/src/form/form.ts` — replace flat Proxy with chain proxy, add `chainProxyCache`, update `getOrCreateField()` to use dot-path keys, update initial value resolution to `resolveNestedInitial()`, update `setFieldError` to accept dot-paths, update submit pipeline to use `formDataToObject(fd, { nested: true })`, change `initial` type to `DeepPartial<TBody>`
- `packages/ui/src/form/__tests__/form.test.ts` — new test cases for nested access

### Phase 3: Compiler N-Level Chain Support

**Goal:** The signal transformer and JSX analyzer support arbitrary-depth chains for form field signal access. `userForm.address.street.error` → `userForm.address.street.error.value` in compiled output. `ElementAccessExpression` is handled as an intermediate chain step.

**Critical constraint:** N-level field chains require **chain length >= 3** (at least one intermediate between root and leaf). This prevents `taskForm.dirty` (2-level) from being matched as a field chain when `dirty` is both a `signalProperty` and a `fieldSignalProperty`. The 2-level case is handled by Pass 2.

**Known limitations (consistent with existing compiler behavior):**
- Destructuring breaks chains: `const { street } = form.address; street.error` — `street` is not a signal API var, no transform applied
- Aliasing breaks chains: `const addr = form.address; addr.street.error` — `addr` is not registered, no transform

**Acceptance Criteria:**

```typescript
describe('Feature: N-level form field chain transformation', () => {
  describe('Given a form variable with fieldSignalProperties', () => {
    describe('When the code has a 4-level chain (root.group.field.signal)', () => {
      it('Then transforms userForm.address.street.error → .value', () => {});
    });

    describe('When the code has a 5-level chain (root.a.b.c.signal)', () => {
      it('Then transforms deep chains → .value', () => {});
    });

    describe('When .value is already present', () => {
      it('Then does not double-transform', () => {});
    });

    describe('When the leaf is NOT a fieldSignalProperty', () => {
      it('Then does not transform', () => {});
    });

    describe('When an intermediate is a signalProperty or plainProperty', () => {
      it('Then does not transform (not a field chain)', () => {});
    });

    describe('When the chain length is 2 (root.fieldSignalProp)', () => {
      it('Then does not match N-level pass (handled by 2-level pass)', () => {});
    });
  });

  describe('Given bracket notation (ElementAccessExpression)', () => {
    describe('When the code has form[dynamicField].error', () => {
      it('Then transforms → form[dynamicField].error.value', () => {});
    });

    describe('When bracket notation is in the middle of a chain', () => {
      it('Then transforms form.items[0].name.error → .value', () => {});
    });

    describe('When multiple bracket notations form[a][b].error', () => {
      it('Then transforms → form[a][b].error.value', () => {});
    });
  });

  describe('Given existing 2-level and 3-level chains', () => {
    describe('When the code has taskForm.submitting (2-level)', () => {
      it('Then still transforms correctly via Pass 2', () => {});
    });

    describe('When the code has taskForm.title.error (3-level)', () => {
      it('Then still transforms correctly via N-level pass', () => {});
    });
  });
});

describe('Feature: N-level JSX reactivity detection', () => {
  describe('Given a 4-level chain in a JSX expression', () => {
    it('Then marks the expression as reactive', () => {});
  });

  describe('Given bracket notation in a JSX expression', () => {
    it('Then marks the expression as reactive', () => {});
  });
});
```

**Files changed:**
- `packages/ui-compiler/src/transformers/signal-transformer.ts` — generalize Pass 1 to N-level, add `ElementAccessExpression` handling
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` — generalize 3-level detection to N-level, add `ElementAccessExpression`
- `packages/ui-compiler/src/transformers/__tests__/signal-transformer.test.ts` — new test cases
- `packages/ui-compiler/src/analyzers/__tests__/jsx-analyzer.test.ts` — new test cases (if exists)

### Phase 4: Types and Integration Tests

**Goal:** TypeScript types enforce correct nested field access. Invalid paths produce type errors. Integration test validates end-to-end developer experience with public imports only.

**Acceptance Criteria:**

```typescript
describe('Feature: nested form type safety', () => {
  describe('Given FormInstance with nested TBody', () => {
    it('Then nested field access is typed: userForm.address.street is FieldState<string>', () => {});
    it('Then invalid nested path is a type error', () => {});
    it('Then field signal property on leaf is typed: .error is Signal<string | undefined>', () => {});
  });

  describe('Given a nested object with a reserved field name', () => {
    it('Then type error is produced when nested field collides with FieldState property', () => {});
  });

  describe('Given FormInstance with array TBody field', () => {
    it('Then indexed access is typed: form.items[0].product is FieldState<string>', () => {});
  });

  describe('Given FormInstance with Date field', () => {
    it('Then Date field is a leaf FieldState (no recursion into Date methods)', () => {});
  });

  describe('Given DeepPartial initial values', () => {
    it('Then partial nested initial values type-check correctly', () => {});
  });

  describe('Given setFieldError with FieldPath', () => {
    it('Then dot-path strings are accepted: setFieldError("address.street", msg)', () => {});
    // @ts-expect-error — invalid dot-path
    it('Then invalid dot-paths are rejected', () => {});
  });

  describe('Given FieldPath utility type', () => {
    it('Then produces union of all valid dot-paths', () => {});
  });
});

describe('Feature: nested form integration walkthrough', () => {
  it('Then form with nested schema validates and submits correctly', () => {});
  it('Then validation errors populate nested field states', () => {});
  it('Then formDataToObject produces nested objects for submission', () => {});
  it('Then setFieldError works with dot-path strings', () => {});
});
```

**Files changed:**
- `packages/ui/src/form/form.ts` — update `FieldAccessors` type to recursive `NestedFieldAccessors`, add `DeepPartial`, `FieldPath`, `ArrayFieldAccessors`, `BuiltInObjects` guard types, update `FormBaseProperties.setFieldError` to accept `FieldPath<TBody>`, update `FormOptions.initial` to `DeepPartial<TBody>`
- `packages/ui/src/form/__tests__/form.test-d.ts` — type-level tests (if exists, or create)
- `packages/integration-tests/src/__tests__/form-walkthrough.test.ts` — extend with nested scenarios

### Phase Dependencies

```
Phase 1 (formDataToObject) ← independent, no deps
Phase 2 (chain proxy)      ← depends on Phase 1 (needs dot-path parsing for submit pipeline)
Phase 3 (compiler)         ← independent of Phase 1/2 (compiler changes are orthogonal)
Phase 4 (types + integration) ← depends on Phase 2 and Phase 3
```

Phases 1 and 3 can be done in parallel. Phase 2 depends on Phase 1. Phase 4 depends on 2 and 3.

---

## 9. Runtime Design Details

### Chain Proxy Implementation

The form Proxy is replaced with a two-level proxy system:

1. **Root Proxy** — intercepts top-level property access on the form instance
   - Known properties (`action`, `method`, `submitting`, etc.) → return directly
   - Unknown string properties → return a `FieldChainProxy` for that path segment

2. **FieldChainProxy** — a Proxy wrapping a dot-path string (e.g., `"address.street"`)
   - If the accessed property is a `fieldSignalProperty` (`error`, `dirty`, `touched`, `value`) → resolve to `getOrCreateField(path).property`
   - If the accessed property is a FieldState method (`setValue`, `reset`) → resolve to `getOrCreateField(path).method`
   - Otherwise → return a cached `FieldChainProxy` extending the path

**Chain proxies are cached** in a `chainProxyCache: Map<string, object>` keyed by the dot-path string. This ensures:
- Referential identity: `userForm.address === userForm.address` (same Proxy object)
- No GC churn from repeated intermediate access in render loops
- Consistent with how `fieldCache` caches `FieldState` objects

```ts
const chainProxyCache = new Map<string, object>();

function getOrCreateChainProxy(dotPath: string): object {
  let proxy = chainProxyCache.get(dotPath);
  if (proxy) return proxy;

  proxy = new Proxy(Object.create(null), {
    get(_target, prop) {
      if (typeof prop === 'string') {
        if (FIELD_STATE_SIGNALS.has(prop)) {
          return getOrCreateField(dotPath)[prop];
        }
        if (FIELD_STATE_METHODS.has(prop)) {
          return getOrCreateField(dotPath)[prop];
        }
        const childPath = `${dotPath}.${prop}`;
        return getOrCreateChainProxy(childPath);
      }
      return undefined;
    },
  });

  chainProxyCache.set(dotPath, proxy);
  return proxy;
}
```

### Initial Value Resolution for Nested Fields

Currently `getOrCreateField()` reads initial values from a flat object:
```ts
const initialValue = initialObj?.[name];
```

For nested fields, the initial value is resolved by traversing the path:
```ts
function resolveNestedInitial(obj: Record<string, unknown> | undefined, dotPath: string): unknown {
  if (!obj) return undefined;
  const segments = dotPath.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
```

### formDataToObject Nested Parsing (opt-in)

The `nested` option is added to `FormDataOptions`. When `true`, dot-separated keys are parsed into nested objects. When `false` (default), keys are preserved as flat strings (backward compatible).

```ts
export interface FormDataOptions {
  coerce?: boolean;
  nested?: boolean;  // NEW — opt-in nested dot-path parsing
}

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const isNextArray = /^\d+$/.test(nextSegment);
    if (!(segment in current)) {
      current[segment] = isNextArray ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}
```

The form submit pipeline (`submitPipeline`) calls `formDataToObject(formData, { nested: true })` to produce nested objects for schema validation.

### Event Delegation for Nested Input Names

The existing `handleInputOrChange` and `handleFocusout` handlers use `target.name` to look up fields. For nested inputs, `target.name` is already the dot-path string (e.g., `"address.street"`), so `getOrCreateField(target.name)` works unchanged — the fieldCache stores fields with dot-path keys.

---

## 10. Compiler Design Details

### N-Level Chain Detection Algorithm

Replace the fixed 3-level Pass 1 with a general algorithm:

1. For each `PropertyAccessExpression` node where the leaf property is a `fieldSignalProperty`:
2. Walk up the chain collecting intermediate property accesses and element accesses
3. Find the root: the first `Identifier` in the chain
4. Check: root is a signal API var with `fieldSignalProperties`
5. Check: **chain length >= 3** (at least one intermediate between root and leaf)
6. Check: no intermediate `PropertyAccessExpression` name is a `signalProperty` or `plainProperty`
7. If all checks pass → append `.value` to the leaf node, record the full chain range

**Why chain length >= 3?** `dirty` appears in both `signalProperties` and `fieldSignalProperties`. Without the minimum length, `taskForm.dirty` (2-level) would match both Pass 1 (as a field chain for path `""` with leaf `dirty`) and Pass 2. The minimum length ensures 2-level chains are handled exclusively by Pass 2.

```
Chain: userForm.address.street.error
       ^^^^^^^^                        root (Identifier, signal API var)
                .address               intermediate (PropertyAccess, not signal/plain prop)
                        .street        intermediate (PropertyAccess, not signal/plain prop)
                               .error  leaf (fieldSignalProperty) → append .value
```

### ElementAccessExpression Handling

An `ElementAccessExpression` (e.g., `form[x]`) can appear at any point in the chain. The algorithm treats it as an opaque intermediate step — it doesn't validate the bracket content, only checks:
- The chain root is a signal API var
- The leaf is a `fieldSignalProperty`

```
Chain: taskForm[fieldName].error
       ^^^^^^^^                  root (Identifier, signal API var)
               [fieldName]       intermediate (ElementAccess)
                          .error leaf (fieldSignalProperty) → append .value

Chain: orderForm.items[0].product.error
       ^^^^^^^^^                        root
                .items                  intermediate (PropertyAccess)
                      [0]               intermediate (ElementAccess)
                         .product       intermediate (PropertyAccess)
                                 .error leaf → append .value
```

### Pass Structure

The two-pass structure is preserved:
- **Pass 1 (updated):** N-level field signal chains (replaces fixed 3-level)
- **Pass 2 (unchanged):** 2-level signal API property chains

Pass 1 records ranges of transformed chains. Pass 2 skips nodes inside those ranges, preventing double-transformation of intermediate property accesses.

---

## 11. Migration

### Backward Compatibility

Fully backward compatible:
- Flat form fields continue to work identically
- 3-level chains (`taskForm.title.error`) are a subset of N-level chains
- `formDataToObject()` without `nested: true` produces the same output as before (flat keys preserved)
- The `initial` type change from `Partial<TBody>` to `DeepPartial<TBody>` is widening — all existing code type-checks
- The `setFieldError` type change from `keyof TBody & string` to `FieldPath<TBody>` includes all previous valid values

### New Capability

Developers opt in by:
1. Using nested schemas with `form()`
2. Using dot-notation string literals for nested input `name` attributes
3. `formDataToObject(fd, { nested: true })` for external callers (form submit pipeline uses it automatically)

---

## 12. Review Log

### Rev 1 → Rev 2 Changes

Addressed feedback from three review agents (DX, Product/scope, Technical):

| Finding | Source | Resolution |
|---------|--------|------------|
| Group-level vs. leaf-level `.error` ambiguity | DX #1 | Added "Group-Level vs. Leaf-Level Clarity" section in Manifesto Alignment. Documented that group-level FieldState is NOT aggregated. |
| `Symbol.toPrimitive` unreliable for `fields` proxy in JSX | DX #2 | Deferred nested `fields` proxy entirely. Developers use dot-notation string literals. Added to Non-Goals. |
| `FieldNames` type not updated for nesting | DX #4 | Deferred with nested `fields` proxy. |
| `initial` needs `DeepPartial<TBody>` | DX #7 | Updated Section 1E and Phase 2/4 to use `DeepPartial<TBody>`. Added concrete type definition. |
| `setFieldError` needs dot-path support | DX #8 | Added Section 1F. `setFieldError` accepts `FieldPath<TBody>`. Added type definition and test criteria. |
| Field array indexed access limited standalone value | Product #1 | Added clarifying note in Section 1C. |
| Sparse array behavior underspecified | Product #2, DX #6 | Documented in Phase 1 acceptance criteria. Sparse arrays pass through as-is. |
| Chain proxy caching (identity bug) | Technical #1 | Added `chainProxyCache: Map<string, object>` to Section 9. Updated Phase 2 criteria. |
| Array type special-casing in `NestedFieldAccessors` | Technical #2 | Added `ArrayFieldAccessors` concrete type definition in Section 6. |
| Built-in object guard (Date, RegExp, etc.) | Technical #3 | Added `BuiltInObjects` type guard in Section 6. |
| `formDataToObject` breaking change | Technical #4 | Made nested parsing opt-in (`nested: true`). Updated all sections and acceptance tests. |
| N-level chain minimum length >= 3 | Technical #5 | Added as explicit constraint in Phase 3 and Section 10. Documented rationale for `dirty` overlap. |
| Destructuring/aliasing limitations | Technical #6 | Added as Known Limitations in Phase 3. Documented in Unknowns section. |
