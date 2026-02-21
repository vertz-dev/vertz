# ui-008: Forms

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 3 — Forms
- **Estimate:** 32 hours
- **Blocked by:** ui-001, ui-002, ui-003
- **Blocks:** ui-014
- **PR:** —
- **Design doc:** [form-attrs-api-improvement.md](../../plans/form-attrs-api-improvement.md)
- **Issue:** [#527](https://github.com/vertz-dev/vertz/issues/527)

## Description

Implement the `form()` API for SDK-aware form handling with per-field signal states, direct property access, type-safe validation, progressive enhancement, and FormData extraction.

The v1.0 approach is explicit schema — `form(api.users.create, { schema, onSuccess, ... })`. Auto-extraction via `.meta` is deferred to a post-v1.0 codegen enhancement.

The API redesign (discussed in PR #526, captured in #527) eliminates `attrs()`, replaces `error()` method with per-field signal properties, moves all callbacks into `form()` options, and adds compiler-assisted DOM binding for field state tracking.

### What to implement

#### Runtime (`packages/ui/src/form/`)

- `form(sdkMethod, opts?)` core — starts with explicit schema
- Direct properties: `action`, `method`, `onSubmit` (no `attrs()` method)
- `reset()` — clears all fields, errors, dirty, and touched state
- `setFieldError(field, msg)` — programmatically set per-field error (server-side validation)
- `submit(formData?)` — programmatic submit using same callbacks as `onSubmit`
- Per-field signal states via lazy Proxy: `form.<field>.error`, `form.<field>.dirty`, `form.<field>.touched`, `form.<field>.value`
- Form-level signal states: `submitting`, `dirty`, `valid`
- `formDataToObject(formData)` converter with type coercion
- `FormOptions` with `schema`, `initial` (static object only for v1), `onSuccess`, `onError`, `resetOnSuccess`
- `__bindElement(el)` internal method — receives form element from compiler for event delegation
- Progressive enhancement (works without JS)
- Integration with `@vertz/schema` validation

#### Compiler (`packages/ui-compiler/`)

- Extend `signal-api-registry.ts` with `fieldSignalProperties` for 3-level chain support
- Reconcile form registry entry (remove old `errors`/`values`, add new properties)
- Extend signal transformer to handle 3-level property chains (`taskForm.title.error` → `.value` insertion), top-down processing
- Extend JSX analyzer `containsSignalApiPropertyAccess()` for 3-level chains
- Compiler-assisted DOM binding: `onSubmit={taskForm.onSubmit}` on `<form>` generates `__bindElement` call

#### Types (`packages/ui/src/form/`)

- Reserved name enforcement via TypeScript conditional types (not compiler diagnostic)
- `FormInstance<TBody, TResult>` conditional type that errors when `keyof TBody & ReservedFormNames` is non-empty

### Files to create/modify

- `packages/ui/src/form/form.ts` — rewrite with new API surface, Proxy-based field access
- `packages/ui/src/form/field-state.ts` — per-field signal state
- `packages/ui/src/form/form-data.ts` — existing, may need updates
- `packages/ui/src/form/validation.ts` — existing, may need updates
- `packages/ui-compiler/src/signal-api-registry.ts` — add `fieldSignalProperties`, reconcile form entry
- `packages/ui-compiler/src/transformers/signal-transformer.ts` — 3-level chain support
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — `__bindElement` transform for form elements
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` — 3-level reactive detection
- All corresponding `__tests__/` files

### External dependency

`@vertz/codegen` — already available (PR #130 merged). Forms consume the generated SDK, types, and schemas directly. No codegen changes needed for v1.0.

### References

- [Form API Redesign Design Doc](../../plans/form-attrs-api-improvement.md)
- [GitHub Issue #527](https://github.com/vertz-dev/vertz/issues/527)
- [Implementation Plan — Phase 3](../../plans/ui-implementation.md#phase-3-forms)
- [UI Design Doc — Section 9](../../plans/ui-design.md)

## Acceptance Criteria

### API surface

- [ ] `form(sdkMethod, { schema, onSuccess, onError, resetOnSuccess, initial })` creates a form instance
- [ ] `form().action` returns SDK endpoint URL (string)
- [ ] `form().method` returns HTTP method (string)
- [ ] `form().onSubmit` returns submit event handler that validates, calls SDK, invokes callbacks
- [ ] `form().reset()` clears all fields, errors, dirty, and touched state
- [ ] `form().setFieldError(field, msg)` sets per-field error signal (server-side validation)
- [ ] `form().submit(formData?)` triggers submission using same callbacks as `onSubmit`
- [ ] `form().submitting` is a `Signal<boolean>` reflecting submission in progress
- [ ] `form().dirty` is a `Signal<boolean>` reflecting any-field-modified state
- [ ] `form().valid` is a `Signal<boolean>` reflecting all-fields-valid state

### Per-field signal states

- [ ] `form().<field>.error` is a `Signal<string | undefined>` with validation error
- [ ] `form().<field>.dirty` is a `Signal<boolean>` tracking field modification from initial
- [ ] `form().<field>.touched` is a `Signal<boolean>` tracking focus/blur
- [ ] `form().<field>.value` is a `Signal<T>` with current field value
- [ ] Field names are type-safe (`keyof TBody`)
- [ ] Field state objects are lazily created via Proxy (only when accessed)

### Compiler

- [ ] 3-level chain `taskForm.title.error` in JSX attribute correctly inserts `.value`
- [ ] 3-level chain `{taskForm.title.error}` in JSX child correctly inserts `.value`
- [ ] JSX analyzer marks `{taskForm.title.error && <el/>}` as reactive
- [ ] Middle accessor `taskForm.title` alone does NOT insert `.value`
- [ ] 2-level chain `taskForm.submitting` still works (no regression)
- [ ] `onSubmit={taskForm.onSubmit}` on `<form>` generates `__bindElement` call
- [ ] Signal API registry reconciled with new form API surface

### Types

- [ ] Reserved name conflict produces TypeScript type error (conditional type, not compiler diagnostic)
- [ ] `setFieldError()` only accepts `keyof TBody` as field name
- [ ] `form().<field>` only allows fields from `keyof TBody` (negative test: unknown field name)

### Other

- [ ] Form works without JavaScript (progressive enhancement)
- [ ] `resetOnSuccess: true` resets form after successful submission
- [ ] `initial` accepts static object (v1 — reactive signals deferred)
- [ ] `@vertz/schema` validation integration works
- [ ] No `attrs()` method on the public API
- [ ] No `error()` method on the public API
- [ ] No `handleSubmit()` on the public API (replaced by `submit()`)
- [ ] Zero `effect()` needed in form components for field state (common case)
- [ ] Flat schemas only (nested objects are non-goal for v1)
- [ ] Bracket notation `taskForm[dynamicField].error` is non-goal for v1

### Integration Tests

```typescript
// IT-3-1: form() creates a working form with direct property access
test('form() submits valid data through SDK method', async () => {
  function CreateUser() {
    const userForm = form(api.users.create, {
      schema: createUserBodySchema,
      onSuccess: (u) => { result = u; },
    });
    let result: User | null = null;
    return (
      <form action={userForm.action} method={userForm.method} onSubmit={userForm.onSubmit}>
        <input name="name" value="Alice" />
        <input name="email" value="alice@test.com" />
        <button type="submit">Create</button>
      </form>
    );
  }

  const { findByText, click } = renderTest(<CreateUser />);
  await click(findByText('Create'));
  // Verify SDK was called with correct data
});

// IT-3-2: form() per-field error signals work reactively in JSX
test('form() shows per-field validation errors without effect()', async () => {
  function CreateUser() {
    const userForm = form(api.users.create, { schema: createUserBodySchema });
    return (
      <form onSubmit={userForm.onSubmit}>
        <input name="name" value="" />
        {userForm.name.error && <span class="error">{userForm.name.error}</span>}
        <button type="submit">Create</button>
      </form>
    );
  }

  const { findByText, click } = renderTest(<CreateUser />);
  await click(findByText('Create'));
  expect(findByText(/required/i)).toBeTruthy();
});

// IT-3-3: formDataToObject converts FormData with type coercion
test('formDataToObject handles string-to-number coercion', () => {
  const fd = new FormData();
  fd.set('name', 'Alice');
  fd.set('age', '30');
  const obj = formDataToObject(fd);
  expect(obj).toEqual({ name: 'Alice', age: '30' });
});

// IT-3-4: direct properties return correct values
test('form() has action, method, onSubmit as direct properties', () => {
  const userForm = form(api.users.create, { schema: createUserBodySchema });
  expect(userForm.action).toContain('/users');
  expect(userForm.method).toBe('POST');
  expect(typeof userForm.onSubmit).toBe('function');
});

// IT-3-5: 3-level compiler transform
test('compiler transforms taskForm.title.error in JSX', () => {
  const source = `
    const taskForm = form(taskApi.create, { schema });
    return <span>{taskForm.title.error}</span>;
  `;
  const result = transform(source);
  expect(result).toContain('taskForm.title.error.value');
});

// IT-3-6: setFieldError maps server errors to per-field signals
test('setFieldError populates per-field error signal', () => {
  const userForm = form(api.users.create, { schema: createUserBodySchema });
  userForm.setFieldError('email', 'Already taken');
  expect(userForm.email.error.value).toBe('Already taken');
});

// IT-3-7: submit() uses same callbacks as onSubmit
test('submit() triggers submission with configured callbacks', async () => {
  let result: User | null = null;
  const userForm = form(api.users.create, {
    schema: createUserBodySchema,
    onSuccess: (u) => { result = u; },
  });
  const fd = new FormData();
  fd.set('name', 'Alice');
  fd.set('email', 'alice@test.com');
  await userForm.submit(fd);
  expect(result).not.toBeNull();
});

// IT-3-8: compiler generates __bindElement for form elements
test('compiler generates __bindElement for form with onSubmit', () => {
  const source = `
    const taskForm = form(taskApi.create, { schema });
    return <form onSubmit={taskForm.onSubmit}></form>;
  `;
  const result = transform(source);
  expect(result).toContain('__bindElement');
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
- 2026-02-21: Updated to reflect form API redesign (#527). `attrs()` eliminated, per-field signal states added, callbacks moved to `form()` options. Compiler changes added for 3-level chain support.
- 2026-02-21: Addressed review findings. Reserved names → TypeScript conditional types. Static-only initial values for v1. Added `setFieldError()`, `submit()`. Compiler-assisted DOM binding. Lazy Proxy for field states. Explicit non-goals for nested schemas, bracket notation, reactive initial.
