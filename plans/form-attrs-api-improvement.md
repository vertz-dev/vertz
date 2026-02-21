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

All configuration lives in `form()` options. No separate `attrs()` call. No separate `handleSubmit()` call. The `schema` option remains explicit until SDK `.meta` embeds schemas (Section 6).

### 2B. Form binding — direct properties, no `attrs()`

```tsx
<form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
```

`action`, `method`, `onSubmit` are plain properties on the form object. Progressive enhancement attributes without an intermediary method.

The compiler transforms `onSubmit={taskForm.onSubmit}` to `__on(el, "submit", taskForm.onSubmit)`. During SSR, `__on()` is a no-op and the SSR JSX runtime filters out `on*` function attributes before serialization.

### 2C. Per-field signal states — direct property access

```tsx
<input name="title" />
{taskForm.title.error && <span class="error">{taskForm.title.error}</span>}
<input name="description" class={taskForm.description.dirty ? 'modified' : ''} />
<button disabled={taskForm.submitting}>
  {taskForm.submitting ? 'Creating...' : 'Create Task'}
</button>
```

**Zero effects. Zero bridge variables. Zero field declarations.**

The compiler auto-unwraps all signal properties in JSX:
- 2-level: `taskForm.submitting` — form-level signal
- 3-level: `taskForm.title.error` — field-level signal

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

### 2F. Per-field signal properties

Accessed via `taskForm.<fieldName>.<property>`:

| Property | Type | Description |
|---|---|---|
| `error` | `Signal<string \| undefined>` | Validation error message |
| `dirty` | `Signal<boolean>` | Value differs from initial |
| `touched` | `Signal<boolean>` | Field was focused then blurred |
| `value` | `Signal<T>` | Current field value |

---

## 3. Reserved Name Enforcement

Form-level property names are reserved. If the schema defines a field with a conflicting name, **the compiler must error** (not warn):

```
Error: Form field "submitting" conflicts with reserved form property "submitting".
Rename the field in your schema to avoid this conflict.
Reserved names: submitting, dirty, valid, action, method, onSubmit, reset
```

This mirrors how native `HTMLFormElement` handles the same conflict (e.g., `form.submit` is both a method and potentially a field named "submit"). We catch it at compile-time instead of letting it be a runtime surprise.

The compiler validates this by checking form schema field names against the union of `signalProperties` and `plainProperties` in the signal API registry.

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

### Initial values

The `initial` option accepts a static object or a reactive signal (from `query()`):

```tsx
// Create form — static initial values
const taskForm = form(taskApi.create, {
  schema,
  initial: { title: '', description: '', priority: 'medium' },
  onSuccess,
});

// Edit form — reactive initial values from query
const taskQuery = query(() => fetchTask(id));
const taskForm = form(taskApi.update, {
  schema,
  initial: taskQuery.data,  // form updates baseline when query resolves
  onSuccess,
});
```

When `initial` is a signal, the form reactively updates its baseline for dirty tracking. SSR hydration works because `query()` already handles that path.

---

## 5. Compiler Changes Required

### 5A. Extend signal API registry

```ts
form: {
  signalProperties: new Set(['submitting', 'dirty', 'valid']),
  plainProperties: new Set(['action', 'method', 'onSubmit', 'reset']),
  // NEW: any property NOT in the above sets is a field name,
  // and these are the signal properties on field objects:
  fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
}
```

### 5B. Extend signal transformer for 3-level chains

Currently the transformer only handles 2-level chains (`taskForm.submitting`) because it checks `objExpr.isKind(SyntaxKind.Identifier)`. Needs to trace full property chains:

- `taskForm.submitting` — form-level signal — insert `.value`
- `taskForm.title.error` — middle property NOT in signalProperties/plainProperties — treat as field name — check leaf against fieldSignalProperties — insert `.value`
- `taskForm.title` — field accessor object (NOT a signal, no `.value`)

### 5C. JSX analyzer for 3-level reactive detection

The JSX analyzer's `containsSignalApiPropertyAccess()` also needs to handle 3-level chains to mark expressions like `{taskForm.title.error && <span>...</span>}` as reactive.

### 5D. Reserved name validation

Add a compiler diagnostic that checks form schema field names against reserved form property names. Must emit an **error**, not a warning. This requires the compiler to understand the schema shape — either from inline schema definitions or from the signal API registry's reserved names list.

---

## 6. Future Scope: SDK Schema Integration

This section documents the planned evolution. **Not in current scope.**

### 6A. SDK methods carry `.meta` with `bodySchema`

The `EntitySdkGenerator` will embed a `.meta` property on each SDK method:

```ts
// Generated SDK output (future)
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

### 6B. `form()` extracts schema automatically

```ts
// Future — no schema option needed
const todoForm = form(api.todos.create);

// Schema extracted from api.todos.create.meta.bodySchema
// action extracted from api.todos.create.meta.path
// method extracted from api.todos.create.meta.method
```

The `schema` option becomes optional — only needed for custom client-side validation that differs from the server schema.

### 6C. Progressive enhancement without JS

With real `action` and `method` on the `<form>`, browsers submit natively when JS is disabled. The server validates with the same schema (it's the entity definition) and responds with a redirect or re-render with errors.

---

## 7. Full Component Example — Before and After

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

## 8. Manifesto Alignment

### "One Way to Do Things"

After this change, the primary pattern is:

```tsx
<form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
```

Direct property access. No `attrs()`, no `handleSubmit()`. One way to wire a form in JSX.

`handleSubmit()` may remain for programmatic-only use (testing, non-JSX scenarios) but is not the primary API.

### "Explicit over implicit"

Every signal access is visible in the JSX template. `taskForm.title.error` reads exactly like what it does — no hidden effects, no bridge variables. The developer sees the reactive dependency chain directly in the markup.

### "Compile-time over runtime"

- Reserved name conflicts are compile errors, not runtime surprises
- Type errors caught at build time (field names, callback signatures)
- 3-level signal chain detection happens at compile time
- Signal reactivity resolved by compiler, not by developer writing `effect()`

### "AI-first"

The pattern is immediately obvious to any LLM: `form.field.state` (3-level) for fields, `form.state` (2-level) for form-level. No need to discover `error()` method behavior or `attrs()` indirection. The property chain reads like English.

### "Native alignment"

Mirrors `HTMLFormElement` direct field access pattern. In native DOM, `form.title` gives you the input element. In vertz, `taskForm.title` gives you the field state object. Same mental model, same discovery pattern.

---

## 9. Non-Goals

- **SDK `.meta` embedding** — requires codegen changes, separate design and issue
- **JSX spread support** — compiler change, separate effort
- **Server-side error rendering** — progressive enhancement for error responses, future scope
- **Multi-step forms / wizards** — out of scope for v1
- **Optimistic updates** — `query()` concern, not `form()`
- **Auto-generated validation UI** — developer controls error placement in JSX
- **Controlled inputs** — v1 uses uncontrolled (native DOM state) exclusively
- **File uploads** — requires multipart handling and progress tracking, deferred
- **Dynamic field arrays (add/remove)** — requires array-aware schema validation, deferred
- **Combined loading + submission** — `query()` and `form()` remain separate (see Section 4)

---

## 10. Unknowns

### 10.1 Should callbacks live in `form()` options or in a separate method?

**Resolution: `form()` options.** All configuration lives in one place — schema, callbacks, initial values, resetOnSuccess. No separate `attrs()` or per-invocation callback passing. This eliminates the question of "where do I configure X?" — the answer is always `form()`.

### 10.2 Should reserved name conflicts be warnings or errors?

**Resolution: Errors.** If a schema field name conflicts with a form-level property name (`submitting`, `action`, etc.), the compiler must error. A warning would let broken code through. The developer must rename the field in their schema.

### 10.3 Should `initial` accept async functions?

**Resolution: No.** Use `query()` for async data loading and pass `query.data` (a signal) as `initial`. This keeps responsibilities separate — `query()` handles loading states and errors, `form()` handles form state. An async `initial` would compound loading and submission states on the form object (see Section 4).

### 10.4 How does the compiler detect field names vs reserved names?

**Resolution: Exclusion.** The signal API registry defines `signalProperties` and `plainProperties` for `form`. Any property access on a form object that is NOT in either set is treated as a field name. The leaf property is then checked against `fieldSignalProperties`. This means the compiler doesn't need to know the schema — it just needs to know what ISN'T a field.

### 10.5 Should `handleSubmit()` be kept or removed?

**Resolution: Keep for now.** `handleSubmit()` serves testing and non-JSX scenarios (programmatic form submission with raw FormData). It's not the primary API, but removing it would break existing tests and narrow the escape hatch. May deprecate later if `onSubmit` covers all use cases.

---

## 11. Type Flow Map

```
SdkMethod<TBody, TResult>
  → form(sdkMethod, FormOptions<TBody, TResult>)
    → FormInstance<TBody, TResult>
      → .action: string
      → .method: string
      → .onSubmit: (e: Event) => Promise<void>
      → .reset: () => void
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

All paths require `.test-d.ts` verification.

---

## 12. E2E Acceptance Tests

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

### Type tests (`packages/ui/src/form/__tests__/form.test-d.ts`)

1. `form()` options accept `onSuccess: (result: TResult) => void`
2. `form()` options accept `onError: (errors: Record<string, string>) => void`
3. `form().<field>` returns `FieldState` with `error`, `dirty`, `touched`, `value`
4. `form().<field>` only allows fields from `keyof TBody` (negative test: unknown field name)
5. `form().submitting` is `Signal<boolean>`
6. `form().action` is `string`
7. `form().onSubmit` is `(e: Event) => Promise<void>`
8. Reserved name conflict produces type error (negative test)

### Compiler tests (`packages/ui-compiler/src/__tests__/`)

1. 3-level chain: `taskForm.title.error` in JSX attribute inserts `.value` on `error`
2. 3-level chain: `{taskForm.title.error}` in JSX child inserts `.value`
3. 2-level chain: `taskForm.submitting` still works (no regression)
4. Middle accessor: `taskForm.title` alone does NOT insert `.value` (it's a field object, not a signal)
5. JSX analyzer marks `{taskForm.title.error && <el/>}` as reactive
6. Reserved name validation errors on conflicting field names

### Integration: examples

1. entity-todo `TodoForm`: zero `effect()`, zero `addEventListener`, uses direct field access
2. task-manager `TaskForm`: zero `effect()`, uses per-field error signals
3. SSR renders forms without serialization errors

---

## 13. Implementation Plan

> **Note:** This plan replaces the previous `attrs()` improvement plan. The implementation
> is tracked in [#527](https://github.com/vertz-dev/vertz/issues/527).

### Phase 1: Compiler — 3-level property chain support

**Goal:** Extend the signal transformer and JSX analyzer to handle `taskForm.title.error` style 3-level chains.

**Steps:**
1. Add `fieldSignalProperties` to `SignalApiEntry` type in `signal-api-registry.ts`
2. Update `form` entry with `fieldSignalProperties: ['error', 'dirty', 'touched', 'value']`
3. Extend signal transformer to detect 3-level chains: if middle property is NOT in `signalProperties`/`plainProperties`, treat as field name, check leaf against `fieldSignalProperties`
4. Extend JSX analyzer `containsSignalApiPropertyAccess()` for 3-level chains
5. Add reserved name validation diagnostic

**Integration test:** Compiler correctly transforms `{taskForm.title.error}` in JSX to insert `.value`. Compiler errors on reserved name conflicts. All existing 2-level tests still pass.

### Phase 2: Runtime — `FormInstance` API redesign

**Goal:** Rewrite `form()` to return the new API surface with direct properties and per-field signal states.

**Steps:**
1. Type tests (RED): `FormOptions` with `onSuccess`/`onError`/`resetOnSuccess`, `FormInstance` with direct `.action`, `.method`, `.onSubmit`, field accessors
2. Unit tests (RED): direct property access, per-field signals, form-level signals
3. Implementation (GREEN): rewrite `form.ts` with new API
4. Remove `attrs()` method (or deprecate — see Unknown 10.5)
5. Verify all quality gates

**Integration test:** `bun test` and `bun run typecheck` in `packages/ui` pass.

### Phase 3: Runtime — per-field state tracking

**Goal:** Implement `dirty`, `touched`, `value` field-level signals and form-level `dirty`/`valid`.

**Steps:**
1. Unit tests (RED): dirty tracking, touched tracking, value signals, form-level dirty/valid
2. Implementation (GREEN): MutationObserver or input/change/focus/blur event delegation for field state tracking
3. Initial values support (static and signal-based)
4. `reset()` clears all field states

**Integration test:** Field-level signals update reactively when user interacts with form inputs.

### Phase 4: Example rewrites

**Goal:** Rewrite both example forms to use the new API — zero `effect()`, zero `addEventListener`.

**Steps:**
1. Rewrite `examples/entity-todo/src/components/todo-form.tsx`
2. Rewrite `examples/task-manager/src/components/task-form.tsx`
3. All existing tests pass with the rewritten components
4. SSR tests pass

**Integration test:** `bun test` in both example packages — all tests pass.

### Phase 5: Final verification

**Goal:** Full monorepo green.

**Steps:**
1. `bun run typecheck` — all packages
2. `bun run lint` — all packages
3. `bun test` — all packages
4. Verify no remaining `effect()` or `addEventListener` in form components
5. Verify no remaining `attrs()` usage

**Integration test:** `bun run ci` passes.

---

## 14. Compiler Constraint: No JSX Spread

The vertz compiler does **not** support JSX spread attributes (`{...obj}`). The JSX transformer at `packages/ui-compiler/src/transformers/jsx-transformer.ts` processes only `JsxAttribute` nodes, skipping `JsxSpreadAttribute`.

This is no longer a practical issue — the new API uses direct property access (`taskForm.action`, `taskForm.method`, `taskForm.onSubmit`) instead of destructuring from `attrs()`. Each property is assigned explicitly in JSX.
