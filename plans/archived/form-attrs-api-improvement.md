# form() API Redesign — Per-Field Signal States and Direct Property Access

> **Supersedes** the previous `attrs()` improvement design. This document reflects decisions
> from the signal auto-unwrap work (PR #526) and the API redesign discussion captured in
> [#527](https://github.com/vertz-dev/vertz/issues/527).

## 1. Problem Statement

The current `form()` API has four fundamental issues:

### 1.1. Schema duplication

The SDK method already knows its input schema (generated from the entity definition). The developer must re-define the schema manually:

```tsx
// The SDK already knows CreateTodoInput shape — why define it again?
const createTodoSchema: FormSchema<CreateTodoInput> = {
  parse(data: unknown): CreateTodoInput {
    const obj = data as Record<string, unknown>;
    // ... 20 lines of manual validation
  },
};

const todoForm = form(todoApi.create, { schema: createTodoSchema });
```

The entity definition in `schema.ts` already specifies field types and constraints. Asking the developer to manually write a `parse()` function defeats the purpose of codegen.

### 1.2. `error()` is a method, not a signal

Field errors are accessed via `taskForm.error('title')` — a method call that returns a plain string. This forces developers to use `effect()` bridges to make errors reactive in JSX:

```tsx
let titleError = '';
effect(() => {
  titleError = taskForm.error('title') ?? '';
});
```

The same applies to all field states — there's no way to access dirty, touched, or focused state at all.

### 1.3. `attrs()` is unnecessary indirection

The current API splits form properties across an intermediary method:

```tsx
const { action, method, onSubmit } = taskForm.attrs({ onSuccess, resetOnSuccess: true });
```

`action`, `method`, and `onSubmit` should be direct properties on the form object. Callbacks should be in the `form()` options (where the schema is), not passed per-invocation to `attrs()`.

### 1.4. Imperative form wiring

The current pattern requires `addEventListener`, `effect()` blocks, and DOM references:

```tsx
formEl.addEventListener('submit', taskForm.handleSubmit({ onSuccess, onError }));
effect(() => { titleError.textContent = taskForm.error('title') ?? ''; });
effect(() => { submitBtn.disabled = taskForm.submitting.value; });
```

The vertz compiler transforms `onSubmit={fn}` to `__on(el, "submit", fn)` and makes signal reads in JSX reactive. The developer should never write `addEventListener` or `effect()` for form state.

---

## 2. Proposed API

### 2A. Form creation — everything in one place

```tsx
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  initial: { title: '', description: '', priority: 'medium' },
  onSuccess: (task) => navigate(`/tasks/${task.id}`),
  onError: (errors) => console.warn(errors),
  resetOnSuccess: true,
});
```

All configuration lives in `form()` options. No separate `attrs()` call. No separate `handleSubmit()` call. The `schema` option is auto-extracted from SDK `.meta.bodySchema` when present (see Section 7A — implemented).

### 2B. Form binding — direct properties, no `attrs()`

```tsx
<form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
```

`action`, `method`, `onSubmit` are plain properties on the form object. Progressive enhancement attributes without an intermediary method.

**Compiler-assisted DOM binding:** When the compiler sees `onSubmit={taskForm.onSubmit}` on a `<form>` element, it transforms this into a setup call that passes the form element reference to the form instance. This gives the form access to the DOM for per-field state tracking (dirty, touched, value) via event delegation on the form element. See Section 6B for details.

### 2C. Per-field signal states — direct property access

```tsx
<input name="title" />
{taskForm.title.error && <span class="error">{taskForm.title.error}</span>}
<input name="description" class={taskForm.description.dirty ? 'modified' : ''} />
<button disabled={taskForm.submitting}>
  {taskForm.submitting ? 'Creating...' : 'Create Task'}
</button>
```

**Zero effects for the common case.** Zero bridge variables. Zero field declarations.

The compiler auto-unwraps all signal properties in JSX:
- 2-level: `taskForm.submitting` — form-level signal
- 3-level: `taskForm.title.error` — field-level signal

### When you still need `effect()`

The "zero effects" claim holds for the common case of displaying form state in JSX. Developers will still need `effect()` for:

- **Side effects on field value changes** — e.g., "when country changes, clear the state dropdown." Requires reading `taskForm.country.value` and imperatively modifying another field.
- **Derived state across multiple fields** — e.g., computing a character count from `taskForm.description.value` for use outside JSX.
- **Subscriptions and cleanup** — e.g., debouncing field value changes for live search.

These cases are inherent to imperative side effects and are not solvable by the form API. They are the same cases where `effect()` is needed with any other signal.

### 2D. Form-level signal properties

| Property | Type | Description |
|---|---|---|
| `submitting` | `Signal<boolean>` | Submission in progress |
| `dirty` | `Signal<boolean>` | Any field changed from initial |
| `valid` | `Signal<boolean>` | All fields pass validation |

### 2E. Form-level plain properties

| Property | Type | Description |
|---|---|---|
| `action` | `string` | SDK endpoint URL (progressive enhancement) |
| `method` | `string` | HTTP method (progressive enhancement) |
| `onSubmit` | `(e: Event) => Promise<void>` | Submit event handler |
| `reset` | `() => void` | Reset form to initial values |
| `setFieldError` | `(field: keyof TBody, msg: string) => void` | Programmatically set a field error (e.g., server-side validation) |
| `submit` | `(formData?: FormData) => Promise<void>` | Programmatic submit using same callbacks as `onSubmit` |

### 2F. Per-field signal properties

Accessed via `taskForm.<fieldName>.<property>`:

| Property | Type | Description |
|---|---|---|
| `error` | `Signal<string \| undefined>` | Validation error message |
| `dirty` | `Signal<boolean>` | Value differs from initial |
| `touched` | `Signal<boolean>` | Field was focused then blurred |
| `value` | `Signal<T>` | Current field value |

### 2G. Server-side validation errors

Server responses often return field-level errors (e.g., "email already taken"). The `onError` callback receives these, and `setFieldError()` maps them to per-field signals:

```tsx
const userForm = form(api.users.create, {
  schema,
  onSuccess: (user) => navigate(`/users/${user.id}`),
  onError: (errors) => {
    // errors is Record<string, string> from server
    for (const [field, message] of Object.entries(errors)) {
      userForm.setFieldError(field, message);
    }
  },
});
```

After `setFieldError('email', 'Already taken')`, `userForm.email.error` reactively updates and the JSX error display shows the server message. Client-side validation errors and server-side errors use the same signal — the most recent write wins.

---

## 3. Reserved Name Enforcement

Form-level property names are reserved. If the schema defines a field with a conflicting name, **TypeScript produces a type error** at `bun run typecheck` time:

```
Type error: Schema field "submitting" conflicts with reserved form property.
Reserved names: submitting, dirty, valid, action, method, onSubmit, reset, setFieldError, submit
```

### Implementation: TypeScript conditional types

Reserved name enforcement uses TypeScript's type system, not the vertz compiler. The `FormInstance` type uses a conditional type that produces a clear error when field names collide:

```ts
type ReservedFormNames = 'submitting' | 'dirty' | 'valid' | 'action' | 'method' | 'onSubmit' | 'reset' | 'setFieldError' | 'submit';

type FormInstance<TBody, TResult> =
  keyof TBody & ReservedFormNames extends never
    ? FormBaseProperties<TResult> & FieldAccessors<TBody>
    : { __error: `Schema field "${keyof TBody & ReservedFormNames & string}" conflicts with a reserved form property. Rename the field in your schema.` };
```

This is caught by `bun run typecheck` — no compiler changes needed. Aligns with "compile-time over runtime."

### Forward-compatibility

Adding a new form-level property in a future version adds a new reserved name. This is a breaking change for any schema that happens to use that name. Since vertz is pre-v1 (0.x), this is acceptable per semver policy. Post-v1, new reserved names would require a major version bump. The reserved set should be kept minimal and stable.

### `dirty` at two levels

`taskForm.dirty` (form-level: any field changed) and `taskForm.title.dirty` (field-level: this field changed) use the same name at different depths. This is intentional — the 2-level vs 3-level chain distinction is sufficient for the compiler, and the naming reads naturally:
- "Is the form dirty?" → `taskForm.dirty`
- "Is the title dirty?" → `taskForm.title.dirty`

The `dirty` field name is reserved (form-level), so no schema can have a field literally named `dirty`. This prevents the ambiguity case.

---

## 4. Initial Values and Data Loading

### Decision: keep `query()` and `form()` separate

**Combined approach (rejected):** Having `form()` handle both data loading and submission compounds too many states:
- `taskForm.loading` — loading initial values or submitting?
- `taskForm.error` — load error, validation error, or submit error?
- Needs namespaced properties (`initialLoading`, `submitError`, `loadError`) which is MORE confusing

**Separate approach (chosen):** `query()` handles data fetching, `form()` handles mutations:
- `taskQuery.loading` — unambiguous (data fetch)
- `taskQuery.error` — unambiguous (fetch failed)
- `taskForm.submitting` — unambiguous (submission)
- `taskForm.title.error` — unambiguous (field validation)
- Each API does one thing, composes cleanly

### Initial values (v1: static only)

The `initial` option accepts a **static object** in v1:

```tsx
// Create form — static initial values
const taskForm = form(taskApi.create, {
  schema,
  initial: { title: '', description: '', priority: 'medium' },
  onSuccess,
});
```

For edit forms, load data with `query()` and create the form after data is available:

```tsx
const taskQuery = query(() => fetchTask(id));

// Create form when data is available (inside a conditional or after loading)
let task = taskQuery.data.value;
if (task) {
  const taskForm = form(taskApi.update, {
    schema,
    initial: { title: task.title, description: task.description },
    onSuccess,
  });
}
```

**Reactive `initial` (signal from query) is deferred to post-v1.** The edge cases — baseline updates while user has dirty fields, `undefined` initial state with uncontrolled inputs, disposal of internal effects — require additional design. See Section 7B for future scope.

---

## 5. Runtime Implementation Details

### 5A. Per-field signal creation — lazy Proxy with caching

Field state objects are created lazily via a `Proxy`. When `taskForm.title` is first accessed, the Proxy creates a `FieldState` object with four signals (`error`, `dirty`, `touched`, `value`) and caches it. Subsequent accesses return the cached object.

```ts
// Conceptual implementation
const fieldCache = new Map<string, FieldState>();
const proxy = new Proxy(formBase, {
  get(target, prop) {
    if (prop in target) return target[prop]; // form-level property
    if (typeof prop === 'string' && !fieldCache.has(prop)) {
      fieldCache.set(prop, createFieldState(prop, initialValues[prop]));
    }
    return fieldCache.get(prop);
  },
});
```

This means:
- Forms with 50 fields but only 5 displayed in JSX allocate only 20 signals (4 per accessed field), not 200
- Fields never accessed never allocate
- Memory overhead scales with usage, not schema size

### 5B. Field state tracking — event delegation on the form element

The form tracks field interactions via event delegation on the `<form>` element. The compiler-assisted setup (Section 6B) gives the form a reference to its DOM element. The form then registers three delegated event listeners:

| Event | Purpose | Updates |
|---|---|---|
| `input` / `change` | Value changed | `field.value`, `field.dirty`, `form.dirty` |
| `focusin` | Field focused | (no immediate update) |
| `focusout` | Field blurred | `field.touched` |

Events are matched to field state objects by `event.target.name`. Three event listeners on the form element handle all fields — no per-input listener registration needed.

For v1 (uncontrolled inputs), `field.value` reads from the DOM input's `.value` property on each event, not from a managed signal. The signal reflects the DOM state, not the other way around.

### 5C. SSR considerations

During SSR, per-field signals are inert — the server renders the initial state and does not track field interactions. The `onSubmit` handler is a function that SSR skips (filtered by the SSR JSX runtime). `action` and `method` are serialized to HTML for progressive enhancement.

For performance, `form()` on the server should return static field state objects (plain values, not real signals) to avoid unnecessary allocations. The form instance detects the server environment and uses a lightweight path.

---

## 6. Compiler Changes Required

### 6A. Extend signal API registry

```ts
form: {
  signalProperties: new Set(['submitting', 'dirty', 'valid']),
  plainProperties: new Set(['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit']),
  // NEW: any property NOT in the above sets is a field name,
  // and these are the signal properties on field objects:
  fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
}
```

The exclusion logic: any property access on a form variable that is NOT in `signalProperties` or `plainProperties` is treated as a field name. The leaf property of a 3-level chain is checked against `fieldSignalProperties`.

> **Note:** The current registry at `signal-api-registry.ts` has `signalProperties: ['submitting', 'errors', 'values']` and `plainProperties: ['submit']`. These must be updated to match the new API surface above. `errors` and `values` are removed from the form-level API (replaced by per-field access).

### 6B. Compiler-assisted DOM binding

When the compiler sees `onSubmit={taskForm.onSubmit}` on a `<form>` element, it transforms the output to also pass the form element reference to the form instance. Conceptually:

```ts
// Before transform (developer writes):
<form onSubmit={taskForm.onSubmit}>

// After transform (compiler outputs):
const __el = document.createElement('form');
__on(__el, 'submit', taskForm.onSubmit);
taskForm.__bindElement(__el);  // compiler-inserted setup call
```

`__bindElement()` is an internal method (not public API) that:
1. Stores the form element reference
2. Sets up event delegation listeners (`input`, `change`, `focusin`, `focusout`) on the form element
3. Initializes field value signals from current DOM input values

This gives the form DOM access without requiring an explicit `ref` or `bind()` call from the developer. The compiler handles it automatically when `onSubmit` is a form instance's property.

The compiler detects this pattern by checking: is the `onSubmit` attribute's value a property access on a form-typed variable, where `onSubmit` is in the form's `plainProperties`?

### 6C. Extend signal transformer for 3-level chains

Currently the transformer only handles 2-level chains (`taskForm.submitting`) because it checks `objExpr.isKind(SyntaxKind.Identifier)`. Needs to trace full property chains:

- `taskForm.submitting` — form-level signal — insert `.value`
- `taskForm.title.error` — middle property NOT in signalProperties/plainProperties — treat as field name — check leaf against fieldSignalProperties — insert `.value`
- `taskForm.title` — field accessor object (NOT a signal, no `.value`)

**Top-down processing:** The transformer must process `PropertyAccessExpression` nodes top-down. When it matches a 3-level pattern, it must skip the inner node to avoid double-processing. The inner `PropertyAccessExpression` (`taskForm.title`) must NOT trigger `.value` insertion independently.

**Non-goals for v1:**
- **Bracket notation:** `taskForm[dynamicField].error` uses `ElementAccessExpression`, which the transformer does not handle. Dynamic field access is not supported by the compiler. Developers needing dynamic field access should use the runtime API directly with explicit `.value`.
- **Nested schemas:** 4+ level chains (`taskForm.address.street.error`) are not supported. v1 schemas must be flat — each key of `TBody` is a field. Nested object schemas are a non-goal.

### 6D. JSX analyzer for 3-level reactive detection

The JSX analyzer's `containsSignalApiPropertyAccess()` also needs to handle 3-level chains to mark expressions like `{taskForm.title.error && <span>...</span>}` as reactive.

---

## 7. Future Scope

### 7A. SDK Schema Integration — **IMPLEMENTED**

**Status: Implemented in Issue #527.** The `@vertz/codegen` already embeds `.meta.bodySchema` on generated SDK methods. The `form()` API now has overloads making `schema` optional when `.meta.bodySchema` exists on the SDK method (`SdkMethodWithMeta`).

#### SDK methods carry `.meta` with `bodySchema`

Generated SDK methods embed a `.meta` property with the validation schema:

```ts
// Generated SDK output (current)
import { CreateTodoInputSchema } from '../schemas';

const create = Object.assign(
  (body: CreateTodoInput) => client.post<Todo>('/todos', body),
  {
    meta: {
      operationId: 'createTodo',
      method: 'POST',
      path: '/todos',
      bodySchema: CreateTodoInputSchema,  // @vertz/schema object
    },
  },
);
```

#### `form()` extracts schema automatically

```ts
// SDK with .meta — no schema option needed
const todoForm = form(api.todos.create);

// SDK without .meta — schema REQUIRED (enforced by TypeScript overloads)
const todoForm = form(plainSdk, { schema: mySchema });
```

The `schema` option is optional when the SDK method has `.meta.bodySchema`. An explicit `schema` option overrides the embedded schema when both are present.

#### Progressive enhancement without JS

With real `action` and `method` on the `<form>`, browsers submit natively when JS is disabled. The server validates with the same schema and responds with a redirect or re-render with errors.

### 7B. Reactive Initial Values

Accepting a signal as `initial` (e.g., `initial: taskQuery.data`) would enable edit forms to reactively update their baseline when the query resolves. This requires resolving:

- **Baseline update behavior:** What happens to user edits when the query refetches? Options: suppress baseline updates once any field is dirty, or update baseline but preserve user edits (dirty relative to new baseline).
- **`undefined` initial state:** The signal starts as `undefined` (query loading). The form fields are empty. When the query resolves, the form must populate inputs — but this contradicts "uncontrolled inputs" since it programmatically sets DOM values.
- **Disposal:** The internal `effect()` watching the signal must be disposed when the form is cleaned up. Requires adding `dispose()` to the form API.

Deferred until these edge cases are fully designed.

### 7C. Nested Schemas and Dynamic Fields

Flat schemas (each key of `TBody` is a leaf field) are the v1 model. Nested objects, arrays, and dynamic field access are deferred:

- **Nested objects** — `{ address: { street, city } }` would produce 4-level chains (`taskForm.address.street.error`). Requires deeper compiler chain traversal.
- **Dynamic field arrays** — requires array-aware schema validation and indexed field accessors.
- **Bracket notation** — `taskForm[dynamicField].error` uses `ElementAccessExpression`, unsupported by the compiler.

---

## 8. Full Component Example — Before and After

### Before (current API)

```tsx
import { effect, form } from '@vertz/ui';

function TaskForm({ onSuccess, onCancel }) {
  const taskForm = form(taskApi.create, { schema });
  const formAttrs = taskForm.attrs();

  let isSubmitting = false;
  effect(() => { isSubmitting = taskForm.submitting.value; });

  const titleError = <span />;
  const descError = <span />;
  const submitLabel = <span>Create Task</span>;

  effect(() => {
    submitLabel.textContent = isSubmitting ? 'Creating...' : 'Create Task';
  });

  effect(() => {
    titleError.textContent = taskForm.error('title') ?? '';
    descError.textContent = taskForm.error('description') ?? '';
  });

  const formEl = (
    <form action={formAttrs.action} method={formAttrs.method}>
      <input name="title" />{titleError}
      <textarea name="description" />{descError}
      <button disabled={isSubmitting}>{submitLabel}</button>
    </form>
  );

  formEl.addEventListener('submit', taskForm.handleSubmit({ onSuccess }));
  return formEl;
}
```

### After (proposed API)

```tsx
import { form } from '@vertz/ui';

function TaskForm({ onSuccess, onCancel }) {
  const taskForm = form(taskApi.create, {
    schema,
    onSuccess,
    resetOnSuccess: true,
  });

  return (
    <form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
      <input name="title" />
      {taskForm.title.error && <span class="error">{taskForm.title.error}</span>}

      <textarea name="description" />
      {taskForm.description.error && <span class="error">{taskForm.description.error}</span>}

      <button type="submit" disabled={taskForm.submitting}>
        {taskForm.submitting ? 'Creating...' : 'Create Task'}
      </button>
    </form>
  );
}
```

**3 effects → 0 effects. 7 extra declarations → 0. Same behavior.**

---

## 9. Manifesto Alignment

### "One Way to Do Things"

After this change, the primary pattern is:

```tsx
<form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
```

Direct property access. No `attrs()`. One way to wire a form in JSX.

`submit(formData?)` exists for programmatic submission (testing, non-JSX scenarios) but uses the same callbacks configured in `form()` options — it is not a separate configuration point.

### "Explicit over implicit"

Every signal access is visible in the JSX template. `taskForm.title.error` reads exactly like what it does — no hidden effects, no bridge variables. The developer sees the reactive dependency chain directly in the markup.

### "Compile-time over runtime"

- Reserved name conflicts caught by TypeScript's type system at `bun run typecheck`
- Type errors caught at build time (field names, callback signatures)
- 3-level signal chain detection happens at compile time
- Signal reactivity resolved by compiler, not by developer writing `effect()`

### "AI-first"

The pattern is immediately obvious to any LLM: `form.field.state` (3-level) for fields, `form.state` (2-level) for form-level. No need to discover `error()` method behavior or `attrs()` indirection. The property chain reads like English.

### "Native alignment"

Mirrors `HTMLFormElement` direct field access pattern. In native DOM, `form.title` gives you the input element. In vertz, `taskForm.title` gives you the field state object. Same mental model, same discovery pattern.

---

## 10. Non-Goals

- ~~**SDK `.meta` embedding**~~ — **DONE**: codegen already embeds `.meta.bodySchema`, `form()` auto-extracts it
- **JSX spread support** — compiler change, separate effort
- **Server-side error rendering** — progressive enhancement for error responses, future scope
- **Multi-step forms / wizards** — out of scope for v1
- **Optimistic updates** — `query()` concern, not `form()`
- **Auto-generated validation UI** — developer controls error placement in JSX
- **Controlled inputs** — v1 uses uncontrolled (native DOM state) exclusively
- **File uploads** — requires multipart handling and progress tracking, deferred
- **Dynamic field arrays (add/remove)** — requires array-aware schema validation, deferred
- **Combined loading + submission** — `query()` and `form()` remain separate (see Section 4)
- **Nested object schemas** — v1 schemas must be flat (each `keyof TBody` is a leaf field)
- **Bracket notation field access** — `taskForm[dynamicField].error` not supported by compiler
- **Reactive initial values** — deferred to post-v1 (see Section 7B)

---

## 11. Unknowns

### 11.1 Should callbacks live in `form()` options or in a separate method?

**Resolution: `form()` options.** All configuration lives in one place — schema, callbacks, initial values, resetOnSuccess. No separate `attrs()` or per-invocation callback passing. This eliminates the question of "where do I configure X?" — the answer is always `form()`.

### 11.2 Should reserved name conflicts be warnings or errors?

**Resolution: Errors, via TypeScript conditional types.** If a schema field name conflicts with a form-level property name, TypeScript's type system produces an error at `bun run typecheck` time. No compiler diagnostic needed — the type system handles it naturally. This aligns with "compile-time over runtime."

### 11.3 Should `initial` accept async functions or signals?

**Resolution: Static objects only for v1.** Use `query()` for async data loading and pass the resolved data as a static `initial` object. Reactive initial values (signals) are deferred to post-v1 due to unresolved edge cases around baseline updates, dirty field handling, and disposal. See Section 7B.

### 11.4 How does the compiler detect field names vs reserved names?

**Resolution: Exclusion.** The signal API registry defines `signalProperties` and `plainProperties` for `form`. Any property access on a form object that is NOT in either set is treated as a field name. The leaf property is then checked against `fieldSignalProperties`. This means the compiler doesn't need to know the schema — it just needs to know what ISN'T a field.

### 11.5 Should `handleSubmit()` be kept or removed?

**Resolution: Replace with `submit()`.** The old `handleSubmit()` (factory function returning a handler with independent callbacks) is removed. Replaced by `submit(formData?)` — a direct method that uses the same callbacks configured in `form()` options. This maintains the escape hatch for testing and programmatic submission without creating a second configuration point. One set of callbacks, two ways to trigger them (`onSubmit` via JSX, `submit()` via code).

### 11.6 How does `form()` access the DOM for field state tracking?

**Resolution: Compiler-assisted setup.** The compiler transforms `onSubmit={taskForm.onSubmit}` on `<form>` elements to also call `taskForm.__bindElement(formEl)`, passing the form element reference. This sets up event delegation for dirty/touched/value tracking without requiring an explicit `ref` or `bind()` call. See Section 6B.

### 11.7 How should server-side validation errors be handled?

**Resolution: `setFieldError(field, msg)`.** A plain method on the form instance that programmatically sets a field's error signal. Called from `onError` callback to map server responses to per-field error display. Client-side validation errors and server-side errors use the same signal — the most recent write wins.

---

## 12. Type Flow Map

```
SdkMethod<TBody, TResult>
  → form(sdkMethod, FormOptions<TBody, TResult>)
    → FormInstance<TBody, TResult>
      → .action: string
      → .method: string
      → .onSubmit: (e: Event) => Promise<void>
      → .reset: () => void
      → .setFieldError: (field: keyof TBody, msg: string) => void
      → .submit: (formData?: FormData) => Promise<void>
      → .submitting: Signal<boolean>
      → .dirty: Signal<boolean>
      → .valid: Signal<boolean>
      → .[fieldName: keyof TBody]: FieldState
          → .error: Signal<string | undefined>
          → .dirty: Signal<boolean>
          → .touched: Signal<boolean>
          → .value: Signal<T>
```

Type flow paths:
- `TResult` flows: `SdkMethod` → `FormOptions.onSuccess(result: TResult)`
- `TBody` flows: `SdkMethod` → `FormOptions.schema` → field names → `FieldState` accessor keys
- `TBody[K]` flows: `SdkMethod` → per-field `.value: Signal<TBody[K]>`
- `keyof TBody` flows: field accessor names on `FormInstance` → type-safe property access
- `keyof TBody` flows: `setFieldError(field)` — type-safe field name parameter
- `keyof TBody & ReservedFormNames` flows: conditional type → compile error if non-empty

All paths require `.test-d.ts` verification.

---

## 13. E2E Acceptance Tests

### Unit tests (`packages/ui/src/form/__tests__/form.test.ts`)

1. `form()` accepts `onSuccess`, `onError`, `resetOnSuccess` in options
2. `form().action` and `form().method` return SDK endpoint metadata
3. `form().onSubmit` validates, calls SDK, invokes `onSuccess`
4. `form().onSubmit` invokes `onError` on validation failure
5. `form().onSubmit` with `resetOnSuccess: true` calls `formElement.reset()` on success
6. `form().<field>.error` returns reactive validation error signal
7. `form().<field>.dirty` tracks field modification from initial value
8. `form().<field>.touched` tracks focus/blur interactions
9. `form().<field>.value` returns current field value as signal
10. `form().submitting` reflects submission in progress
11. `form().dirty` reflects any-field-modified state
12. `form().valid` reflects all-fields-valid state
13. `form().reset()` clears all fields, errors, dirty, and touched state
14. `form().setFieldError('email', 'Already taken')` sets per-field error signal
15. `form().submit()` triggers submission using same callbacks as `onSubmit`
16. `form().submit(formData)` submits with provided FormData

### Type tests (`packages/ui/src/form/__tests__/form.test-d.ts`)

1. `form()` options accept `onSuccess: (result: TResult) => void`
2. `form()` options accept `onError: (errors: Record<string, string>) => void`
3. `form().<field>` returns `FieldState` with `error`, `dirty`, `touched`, `value`
4. `form().<field>` only allows fields from `keyof TBody` (negative test: unknown field name)
5. `form().submitting` is `Signal<boolean>`
6. `form().action` is `string`
7. `form().onSubmit` is `(e: Event) => Promise<void>`
8. Reserved name conflict produces type error (negative test: schema with field named `submitting`)
9. `form().setFieldError` only accepts `keyof TBody` as field name (negative test)
10. `form().submit` is `(formData?: FormData) => Promise<void>`

### Compiler tests (`packages/ui-compiler/src/__tests__/`)

1. 3-level chain: `taskForm.title.error` in JSX attribute inserts `.value` on `error`
2. 3-level chain: `{taskForm.title.error}` in JSX child inserts `.value`
3. 2-level chain: `taskForm.submitting` still works (no regression)
4. Middle accessor: `taskForm.title` alone does NOT insert `.value` (it's a field object, not a signal)
5. JSX analyzer marks `{taskForm.title.error && <el/>}` as reactive
6. Compiler-assisted DOM binding: `onSubmit={taskForm.onSubmit}` on `<form>` generates `__bindElement` call

### Integration: examples

1. entity-todo `TodoForm`: zero `effect()`, zero `addEventListener`, uses direct field access
2. task-manager `TaskForm`: zero `effect()`, uses per-field error signals
3. SSR renders forms without serialization errors

---

## 14. Implementation Plan

> **Note:** This plan replaces the previous `attrs()` improvement plan. The implementation
> is tracked in [#527](https://github.com/vertz-dev/vertz/issues/527).

### Phase 0: Breaking change documentation

**Goal:** Document the breaking changes from the old API to the new API.

**Steps:**
1. Write changeset describing all breaking changes: `attrs()` removed, `error()` removed, `handleSubmit()` replaced by `submit()`, callbacks moved to `form()` options
2. Create migration mapping: old API → new API

**Integration test:** Changeset file exists with BREAKING notice.

### Phase 1: Compiler — 3-level property chain support

**Goal:** Extend the signal transformer and JSX analyzer to handle `taskForm.title.error` style 3-level chains.

**Steps:**
1. Add `fieldSignalProperties` to `SignalApiEntry` type in `signal-api-registry.ts`
2. Update `form` entry: reconcile with new API surface (remove old `errors`/`values`/`submit`, add new properties)
3. Extend signal transformer to detect 3-level chains: if middle property is NOT in `signalProperties`/`plainProperties`, treat as field name, check leaf against `fieldSignalProperties`. Process top-down, skip inner nodes.
4. Extend JSX analyzer `containsSignalApiPropertyAccess()` for 3-level chains

**Integration test:** Compiler correctly transforms `{taskForm.title.error}` in JSX to insert `.value`. All existing 2-level tests still pass.

### Phase 2: Compiler — DOM binding transform

**Goal:** Implement compiler-assisted DOM binding for form elements.

**Steps:**
1. Detect `onSubmit={formVar.onSubmit}` on `<form>` elements where `formVar` is a form-typed variable
2. Generate `formVar.__bindElement(el)` call after element creation
3. Tests: verify the transform output includes `__bindElement` call

**Integration test:** Compiled output of `<form onSubmit={taskForm.onSubmit}>` includes `__bindElement` call.

### Phase 3: Runtime — `FormInstance` API redesign

**Goal:** Rewrite `form()` to return the new API surface with direct properties, per-field signal states, and lazy Proxy.

**Steps:**
1. Type tests (RED): `FormOptions` with callbacks, `FormInstance` with direct properties, field accessors, reserved name conditional type, `setFieldError`, `submit`
2. Unit tests (RED): direct property access, per-field signals via Proxy, `setFieldError`, `submit`
3. Implementation (GREEN): rewrite `form.ts` with Proxy-based field access, lazy `FieldState` creation
4. Remove `attrs()` and `error()` methods, replace `handleSubmit()` with `submit()`
5. Verify all quality gates

**Integration test:** `bun test` and `bun run typecheck` in `packages/ui` pass.

### Phase 4: Runtime — per-field state tracking

**Goal:** Implement `dirty`, `touched`, `value` field-level signals and form-level `dirty`/`valid` via event delegation.

**Steps:**
1. Unit tests (RED): dirty tracking, touched tracking, value signals, form-level dirty/valid
2. Implement `__bindElement()` — sets up event delegation on form element
3. Implement event handlers: `input`/`change` → update value/dirty, `focusout` → update touched
4. Implement `setFieldError()` — sets per-field error signal programmatically
5. Static initial values support
6. `reset()` clears all field states

**Integration test:** Field-level signals update reactively when user interacts with form inputs.

### Phase 5: Example rewrites

**Goal:** Rewrite both example forms to use the new API — zero `effect()`, zero `addEventListener`.

**Steps:**
1. Rewrite `examples/entity-todo/src/components/todo-form.tsx`
2. Rewrite `examples/task-manager/src/components/task-form.tsx`
3. All existing tests pass with the rewritten components
4. SSR tests pass

**Integration test:** `bun test` in both example packages — all tests pass.

### Phase 6: Final verification

**Goal:** Full monorepo green.

**Steps:**
1. `bun run typecheck` — all packages
2. `bun run lint` — all packages
3. `bun test` — all packages
4. Verify no remaining `effect()` or `addEventListener` in form components
5. Verify no remaining `attrs()` or `error()` usage

**Integration test:** `bun run ci` passes.

---

## 15. Compiler Constraint: No JSX Spread

The vertz compiler does **not** support JSX spread attributes (`{...obj}`). The JSX transformer at `packages/ui-compiler/src/transformers/jsx-transformer.ts` processes only `JsxAttribute` nodes, skipping `JsxSpreadAttribute`.

This is no longer a practical issue — the new API uses direct property access (`taskForm.action`, `taskForm.method`, `taskForm.onSubmit`) instead of destructuring from `attrs()`. Each property is assigned explicitly in JSX.
