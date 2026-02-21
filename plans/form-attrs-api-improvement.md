# form() API — Declarative Forms with SDK Schema Integration

## 1. Problem Statement

The current `form()` API has three fundamental issues:

### 1.1. Schema duplication

The SDK method already knows its input schema (it's generated from the entity definition). But the developer must re-define the schema manually:

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

The entity definition in `schema.ts` already specifies field types and constraints. The generated SDK already has the types. Asking the developer to manually write a `parse()` function defeats the purpose of codegen.

### 1.2. Imperative form wiring

The current pattern requires `addEventListener`, `effect()` blocks, and DOM references:

```tsx
const formAttrs = taskForm.attrs();           // only { action, method }
const formEl = <form action={formAttrs.action} method={formAttrs.method}> ... </form>;

// Imperative: addEventListener after JSX
formEl.addEventListener('submit', taskForm.handleSubmit({ onSuccess, onError }));

// Imperative: effect() blocks for state that should be reactive in JSX
effect(() => { titleError.textContent = taskForm.error('title') ?? ''; });
effect(() => { submitBtn.disabled = taskForm.submitting.value; });
```

The vertz compiler transforms `onSubmit={fn}` → `__on(el, "submit", fn)` and makes signal reads in JSX reactive. The developer should never write `addEventListener` or `effect()` for form state.

### 1.3. No progressive enhancement without JS

The `action` and `method` attributes are derived from SDK metadata, enabling native HTML form submission. But the current API doesn't make this the default path. The framework should make progressive enhancement automatic — the form works without JavaScript, and JavaScript enhances it with client-side validation, loading states, and SPA navigation.

---

## 2. Vision: The End State

The ideal `form()` API requires **one line** to create a fully functional form. The SDK method is the single source of truth for endpoint, HTTP method, and validation schema:

```tsx
// SDK method carries .meta with bodySchema, path, method
// form() extracts everything automatically
const todoForm = form(api.todos.create);

return (
  <form action={todoForm.action} method={todoForm.method} onSubmit={todoForm.submit}>
    <input name="title" type="text" />
    <span>{todoForm.fieldError('title')}</span>
    <button type="submit" disabled={todoForm.submitting.value}>
      {todoForm.submitting.value ? 'Adding...' : 'Add Todo'}
    </button>
  </form>
);
```

**What the framework handles automatically:**
- **Validation** — extracted from SDK method's embedded schema. Runs client-side on submit.
- **Error state** — `todoForm.fieldError('title')` is reactive. Changes when validation fails, clears when the field is corrected. No `effect()`.
- **Submitting state** — `todoForm.submitting.value` is reactive. True during submission, false after. No `effect()`.
- **Form reset** — configurable via options. Automatic after successful submission.
- **preventDefault** — the `submit` handler prevents default and submits via the SDK. No manual interception.
- **Progressive enhancement** — `action` and `method` are real URLs/verbs. Without JS, the browser submits the form natively to the API endpoint. With JS, the framework intercepts for a SPA experience.

**What the developer controls:**
- Form layout (JSX)
- Where errors appear (JSX placement of `fieldError()`)
- Success/error callbacks (what happens after submission)
- Whether the form resets on success

---

## 3. Current Scope: What We Implement Now

The full vision requires SDK `.meta` with embedded schemas (not yet implemented in codegen). This design doc covers the **form() API changes** that unblock declarative usage today, and sets the foundation for the full vision.

### 3A. `attrs()` returns `onSubmit` (framework handles submit interception)

**Before:**
```ts
attrs(): { action: string; method: string }
```

**After:**
```ts
attrs(callbacks?: SubmitCallbacks<TResult>): {
  action: string;
  method: string;
  onSubmit: (e: Event) => Promise<void>;
}
```

The developer no longer calls `handleSubmit()` separately or uses `addEventListener`. The `onSubmit` handler is part of the form attributes — destructured into JSX:

```tsx
const { action, method, onSubmit } = todoForm.attrs({ onSuccess, resetOnSuccess: true });
<form action={action} method={method} onSubmit={onSubmit}>
```

The compiler transforms `onSubmit={onSubmit}` → `__on(el, "submit", onSubmit)`. During SSR, `__on()` is a no-op (SSRElement's `addEventListener` does nothing), and the SSR JSX runtime filters out `on*` function attributes before serialization.

### 3B. `resetOnSuccess` — automatic form reset

```ts
interface SubmitCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (errors: Record<string, string>) => void;
  resetOnSuccess?: boolean;
}
```

When `resetOnSuccess: true`, the framework calls `formElement.reset()` after a successful submission. The developer doesn't manually wire this.

### 3C. Declarative form state — zero `effect()`

The compiler's signal tracking makes `todoForm.error('title')` and `todoForm.submitting.value` reactive when used in JSX expressions. No `effect()` blocks needed:

```tsx
// Reactive without effect() — compiler wraps signal reads
<span>{todoForm.error('title')}</span>
<button disabled={todoForm.submitting.value}>
  {todoForm.submitting.value ? 'Adding...' : 'Add Todo'}
</button>
```

### 3D. Schema still passed manually (temporary)

Until the SDK embeds `.meta` with `bodySchema`, the schema must still be provided:

```ts
const todoForm = form(todoApi.create, { schema: createTodoSchema });
```

This is explicitly temporary. The `schema` option will become optional once SDK methods carry their schemas.

**Immediate follow-up:** The SDK schema integration (Section 5) should be the next design + implementation after this PR lands. The manual schema is the biggest DX pain point in the form API — it forces developers to duplicate logic the framework already knows. Eliminating it is the priority.

### Compiler Constraint: No JSX Spread

The vertz compiler does **not** support JSX spread attributes (`{...obj}`). The JSX transformer at `packages/ui-compiler/src/transformers/jsx-transformer.ts:136` processes only `JsxAttribute` nodes, skipping `JsxSpreadAttribute`.

`<form {...todoForm.attrs()}>` silently drops all attributes. Developers must destructure:

```tsx
// CORRECT
const { action, method, onSubmit } = todoForm.attrs({ onSuccess });
<form action={action} method={method} onSubmit={onSubmit}>

// WRONG — silently ignored by compiler
<form {...todoForm.attrs({ onSuccess })}>
```

---

## 4. Full Component Example (Current Scope)

```tsx
import type { FormSchema } from '@vertz/ui';
import { form } from '@vertz/ui';
import { todoApi } from '../api/mock-data';
import type { CreateTodoInput, Todo } from '../generated';

const createTodoSchema: FormSchema<CreateTodoInput> = {
  parse(data: unknown): CreateTodoInput {
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};
    if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      errors.title = 'Title is required';
    }
    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      throw err;
    }
    return { title: (obj.title as string).trim() };
  },
};

export function TodoForm(props: { onSuccess: (todo: Todo) => void }): HTMLFormElement {
  const todoForm = form(todoApi.create, { schema: createTodoSchema });
  const { action, method, onSubmit } = todoForm.attrs({
    onSuccess: props.onSuccess,
    resetOnSuccess: true,
  });

  return (
    <form action={action} method={method} onSubmit={onSubmit}>
      <input name="title" type="text" placeholder="What needs to be done?" />
      <span>{todoForm.error('title')}</span>
      <button type="submit" disabled={todoForm.submitting.value}>
        {todoForm.submitting.value ? 'Adding...' : 'Add Todo'}
      </button>
    </form>
  ) as HTMLFormElement;
}
```

**Properties:**
- Zero `effect()` — all form state is reactive in JSX
- Zero `addEventListener` — `onSubmit` in JSX, compiled to `__on()`
- Progressive enhancement — `action` and `method` are real endpoint/verb
- SSR safe — `onSubmit` filtered by SSR runtime, `action`/`method` serialized to HTML

---

## 5. Future Scope: SDK Schema Integration

This section documents the planned evolution. **Not implemented in this PR.**

### 5A. SDK methods carry `.meta` with `bodySchema`

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

### 5B. `form()` extracts schema automatically

```ts
// Future — no schema option needed
const todoForm = form(api.todos.create);

// Schema extracted from api.todos.create.meta.bodySchema
// action extracted from api.todos.create.meta.path
// method extracted from api.todos.create.meta.method
```

The `schema` option becomes optional — only needed for custom client-side validation that differs from the server schema.

### 5C. Progressive enhancement without JS

With real `action` and `method` on the `<form>`, browsers submit natively when JS is disabled. The server validates with the same schema (it's the entity definition) and responds with a redirect or re-render with errors.

This is the same model Remix and SvelteKit use — the form works without JS, and JS enhances it.

---

## 6. Manifesto Alignment

### "One Way to Do Things"

After this change, the primary pattern is:

```tsx
const { action, method, onSubmit } = todoForm.attrs({ onSuccess });
<form action={action} method={method} onSubmit={onSubmit}>
```

`handleSubmit()` remains for programmatic use only (raw FormData, non-JSX scenarios). There's one way to wire a form in JSX.

### "Explicit over implicit"

The developer destructures and assigns each prop explicitly. No magic spreading, no hidden behavior. You can see exactly what attributes go on the form.

### "Compile-time over runtime"

- Type errors caught at build time (onSubmit signature, error field names)
- Compiler transforms event handlers — no runtime registration needed
- Signal reactivity resolved by compiler, not by developer writing `effect()`

### "Convention over configuration"

`attrs()` returns the three things every form needs. No configuration required for the common case. `resetOnSuccess` and callbacks are opt-in.

---

## 7. Non-Goals (Current Scope)

- **SDK `.meta` embedding** — requires codegen changes, separate design and issue
- **JSX spread support** — compiler change, separate effort
- **Server-side error rendering** — progressive enhancement for error responses, future scope
- **Multi-step forms / wizards** — out of scope
- **Optimistic updates** — `query()` concern, not `form()`
- **Auto-generated validation UI** — developer controls error placement in JSX

---

## 8. Unknowns

### 8.1 Should `resetOnSuccess` live on `SubmitCallbacks` or `FormOptions`?

**Resolution: `SubmitCallbacks`** — It's a per-invocation behavior. Different call sites might want different reset behavior (e.g., "save" vs "save and continue editing"). Keeping it in callbacks gives that flexibility.

### 8.2 Should `attrs()` always return `onSubmit`, even with no callbacks?

**Resolution: Yes** — Without callbacks, the `onSubmit` handler still validates and submits via the SDK. It just doesn't call any success/error callback. This is useful for fire-and-forget forms and keeps the API consistent.

### 8.3 Should we rename `handleSubmit()` or deprecate it?

**Resolution: Keep it** — `handleSubmit()` serves a distinct purpose: programmatic submission with raw FormData (testing, non-JSX scenarios). It's not redundant with `attrs()` — `attrs()` is for JSX forms, `handleSubmit()` is for everything else.

---

## 9. Implementation Scope

### What changes

| File | Change |
|---|---|
| `packages/ui/src/form/form.ts` | `attrs()` accepts callbacks, returns `onSubmit`. Add `resetOnSuccess` to `SubmitCallbacks`. Extract shared handler logic. |
| `packages/ui/src/form/__tests__/form.test.ts` | Update `attrs()` tests for new return shape. Add tests for callbacks via attrs. Add `resetOnSuccess` test. |
| `packages/ui/src/form/__tests__/form.test-d.ts` | Update type tests for `attrs()` return type and `SubmitCallbacks`. |
| `examples/entity-todo/src/components/todo-form.tsx` | Rewrite: destructured `attrs()`, zero `effect()`, zero `addEventListener`. |
| `examples/task-manager/src/components/task-form.tsx` | Rewrite: destructured `attrs()`, zero `effect()`, zero `addEventListener`. |

### What does NOT change

- `handleSubmit()` — same signature, same behavior
- `error()` — same signature, same behavior
- `submitting` — same signal
- `FormSchema`, `validate()`, `formDataToObject()` — untouched
- SSR pipeline — already handles function attributes correctly
- Compiler — no changes needed
- Codegen — SDK `.meta` is future scope

---

## 10. Type Flow Map

```
SdkMethod<TBody, TResult>
  → form(sdkMethod, { schema: FormSchema<TBody> })
    → FormInstance<TBody, TResult>
      → attrs(SubmitCallbacks<TResult>?)
        → { action: string, method: string, onSubmit: (e: Event) => Promise<void> }
      → handleSubmit(SubmitCallbacks<TResult>?)
        → (formDataOrEvent: FormData | Event) => Promise<void>
      → error(field: keyof TBody & string)
        → string | undefined
      → submitting: Signal<boolean>
```

- `TResult` flows: `SdkMethod` → `SubmitCallbacks.onSuccess(result: TResult)`
- `TBody` flows: `SdkMethod` → `FormSchema<TBody>` → `error(field: keyof TBody & string)`

Both verified in existing `.test-d.ts` type tests.

---

## 11. E2E Acceptance Tests

### Unit tests (`packages/ui/src/form/__tests__/form.test.ts`)

1. `attrs()` returns `{ action, method, onSubmit }` from SDK metadata
2. `attrs()` onSubmit validates, calls SDK, invokes `onSuccess`
3. `attrs()` onSubmit invokes `onError` on validation failure
4. `attrs()` with `resetOnSuccess` calls `formElement.reset()` on success
5. `attrs()` without callbacks runs without error

### Type tests (`packages/ui/src/form/__tests__/form.test-d.ts`)

1. `attrs()` return type includes `onSubmit: (e: Event) => Promise<void>`
2. `attrs()` accepts `SubmitCallbacks<TResult>` with `resetOnSuccess`
3. `attrs()` works with no arguments

### Integration: entity-todo (`examples/entity-todo/src/tests/todo-form.test.ts`)

1. Form has `action` and `method` attributes (progressive enhancement)
2. Shows validation error on empty submission
3. Calls `onSuccess` after valid submission
4. SSR renders form without serialization errors

### Integration: task-manager (`examples/task-manager/src/tests/task-form.test.ts`)

1. Existing tests continue to pass with the rewritten component

---

## 12. Implementation Plan

### Prerequisite: Revert uncommitted form changes

The current working tree has uncommitted changes to `packages/ui/src/form/form.ts`, its tests, and type tests from the previous attempt that skipped the process. These changes are directionally correct but were not TDD-driven. **Revert all uncommitted changes to `packages/ui/`** and redo them properly with strict TDD.

The entity-todo example files (new files for the full-stack demo) are unrelated to this issue and should not be reverted.

### Phase 1: Type tests (RED) — `attrs()` new signature

**Goal:** Define the public API contract via type-level tests before changing any implementation.

**Steps:**
1. Write type tests in `packages/ui/src/form/__tests__/form.test-d.ts`:
   - `attrs()` return type includes `onSubmit: (e: Event) => Promise<void>` (currently fails — attrs returns `{ action, method }` only)
   - `attrs()` accepts optional `SubmitCallbacks<TResult>` with `onSuccess`, `onError`, `resetOnSuccess`
   - `attrs()` works with no arguments (already passes, but verify)
2. Run `bun run typecheck` on `packages/ui` — expect failures on new type assertions

**Integration test:** `bun run typecheck --filter @vertz/ui` fails on new type tests (RED).

### Phase 2: Unit tests (RED) — `attrs()` returns `onSubmit`

**Goal:** Write failing runtime tests for the new `attrs()` behavior.

**Steps:**
1. Write/update tests in `packages/ui/src/form/__tests__/form.test.ts`:
   - `attrs()` returns `{ action, method, onSubmit }` — assert all three properties
   - `attrs()` `onSubmit` validates, calls SDK method, invokes `onSuccess` callback
   - `attrs()` `onSubmit` invokes `onError` on validation failure, does not call SDK
   - `attrs()` without callbacks still works (onSubmit runs without error)
   - `attrs()` `onSubmit` with `resetOnSuccess: true` calls `formElement.reset()` after success
2. Run `bun test` — expect failures on new tests (RED)

**Integration test:** `bun test` in `packages/ui` fails on new attrs tests.

### Phase 3: Implementation (GREEN) — `attrs()` + `resetOnSuccess`

**Goal:** Make all Phase 1 + Phase 2 tests pass.

**Steps:**
1. Update `SubmitCallbacks<TResult>` interface — add `resetOnSuccess?: boolean`
2. Update `FormInstance<TBody, TResult>.attrs()` signature — accepts `SubmitCallbacks`, returns `{ action, method, onSubmit }`
3. Extract `createSubmitHandler()` internal function — shared by `attrs()` and `handleSubmit()`
4. `createSubmitHandler` handles `resetOnSuccess` — calls `formElement.reset()` after `onSuccess` when `resetOnSuccess: true` and submission came from a DOM event
5. `attrs()` implementation — returns `{ action, method, onSubmit: createSubmitHandler(callbacks) }`
6. `handleSubmit` — delegates to `createSubmitHandler` (same behavior, just reuses logic)
7. Run `bun test` — all tests pass (GREEN)
8. Run `bun run typecheck` — passes (GREEN)
9. Run `bunx biome check --write packages/ui/src/form/` — lint/format clean

**Integration test:** `bun test` and `bun run typecheck` in `packages/ui` both pass.

### Phase 4: Refactor — clean up

**Goal:** Clean up implementation while keeping all tests green.

**Steps:**
1. Review JSDoc on `attrs()`, `handleSubmit()`, `SubmitCallbacks` — update documentation for new behavior
2. Verify no dead code from the refactor
3. Run full quality gates: `bun test`, `bun run typecheck`, `bunx biome check`

**Integration test:** All quality gates pass.

### Phase 5: entity-todo `TodoForm` rewrite

**Goal:** Rewrite `examples/entity-todo/src/components/todo-form.tsx` to use the new declarative pattern.

**Steps:**
1. Verify existing entity-todo `TodoForm` tests pass first (baseline)
2. Rewrite `todo-form.tsx`:
   - Destructure `attrs()` with `{ onSuccess, resetOnSuccess }` — no spread
   - Use `onSubmit={onSubmit}` in JSX — compiler transforms to `__on()`
   - Use `todoForm.error('title')` directly in JSX — no `effect()`
   - Use `todoForm.submitting.value` directly in JSX — no `effect()`
   - Zero `addEventListener`, zero `effect()`, zero imperative DOM manipulation
3. Run entity-todo tests — all pass
4. Run entity-todo SSR tests — verify no serialization errors

**Integration test:** `bun test` in `examples/entity-todo` — all tests pass including SSR.

### Phase 6: task-manager `TaskForm` rewrite

**Goal:** Rewrite `examples/task-manager/src/components/task-form.tsx` to use the new declarative pattern.

**Steps:**
1. Verify existing task-manager `TaskForm` tests pass first (baseline)
2. Rewrite `task-form.tsx`:
   - Destructure `attrs()` with `{ onSuccess, onError, resetOnSuccess }` — no spread
   - Use `onSubmit={onSubmit}` in JSX — no `addEventListener`
   - Use `taskForm.error('title')` etc. directly in JSX — no `effect()`
   - Use `taskForm.submitting.value` directly in JSX — no `effect()`
   - Remove `effect()` blocks entirely
   - Keep `onCancel` button with `onClick={onCancel}` (unchanged)
3. Run task-manager tests — all 5 `TaskForm` tests pass
4. Run task-manager SSR tests — verify no regressions

**Integration test:** `bun test` in `examples/task-manager` — all tests pass including SSR.

### Phase 7: Final verification

**Goal:** Full monorepo green.

**Steps:**
1. `bun run typecheck` — all packages
2. `bun run lint` — all packages
3. `bun test` — all packages
4. Verify no remaining `effect()` or `addEventListener` in form components

**Integration test:** `bun run ci` passes.
