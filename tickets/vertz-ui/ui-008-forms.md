# ui-008: Forms

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 3 — Forms
- **Estimate:** 32 hours
- **Blocked by:** ui-001, ui-002, ui-003
- **Blocks:** ui-014
- **PR:** —

## Description

Implement the `form()` API for SDK-aware form handling with type-safe validation, progressive enhancement, and FormData extraction. Forms consume the generated SDK from `@vertz/codegen` (already available, PR #130 merged).

The v1.0 approach is Option C: explicit schema — `form(api.users.create, { schema })`. Auto-extraction via `.meta` is deferred to a post-v1.0 codegen enhancement.

### What to implement

- `form(sdkMethod, opts?)` core — starts with Option C (explicit schema)
- `attrs()` returning `{ action, method }` from SDK endpoint
- `handleSubmit({ onSuccess, onError })` with FormData extraction
- `formDataToObject(formData)` converter with type coercion
- Field-level `error(fieldName)` accessor with type-safe field names
- `submitting` reactive state
- Progressive enhancement (works without JS)
- Explicit schema override option
- Multi-step form support
- Integration with `@vertz/schema` validation

### Files to create

- `packages/ui/src/form/form.ts`
- `packages/ui/src/form/form-data.ts`
- `packages/ui/src/form/validation.ts`
- All corresponding `__tests__/` files

### External dependency

`@vertz/codegen` — already available (PR #130 merged). Forms consume the generated SDK, types, and schemas directly. No codegen changes needed for v1.0.

### References

- [Implementation Plan — Phase 3](../../plans/ui-implementation.md#phase-3-forms)
- [UI Design Doc](../../plans/ui-design.md)
- [Codegen Impact Analysis](../../../backstage/research/explorations/ui-codegen-impact-analysis.md)

## Acceptance Criteria

- [ ] `form(sdkMethod, { schema })` creates a form instance bound to an SDK method
- [ ] `attrs()` returns `{ action, method }` derived from the SDK endpoint
- [ ] `handleSubmit({ onSuccess, onError })` extracts FormData, validates, and calls the SDK method
- [ ] `formDataToObject(formData)` converts FormData to a plain object with type coercion
- [ ] `error(fieldName)` returns field-level validation errors with type-safe field names
- [ ] `submitting` is a reactive state that reflects submission in progress
- [ ] Form works without JavaScript (progressive enhancement)
- [ ] Schema override option works
- [ ] Multi-step form support works
- [ ] `@vertz/schema` validation integration works
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-3-1: form() creates a working form with SDK submission
test('form() submits valid data through SDK method', async () => {
  server.use(
    mockHandlers.users.create(({ request }) => ({
      id: '1', ...request.body, createdAt: '2026-01-01',
    }))
  );

  function CreateUser() {
    const userForm = form(api.users.create, { schema: createUserBodySchema });
    let result: User | null = null;
    return (
      <form
        {...userForm.attrs()}
        onSubmit={userForm.handleSubmit({ onSuccess: (u) => { result = u; } })}
      >
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

// IT-3-2: form() validates client-side before submission
test('form() shows validation errors without calling SDK', async () => {
  function CreateUser() {
    const userForm = form(api.users.create, { schema: createUserBodySchema });
    return (
      <form onSubmit={userForm.handleSubmit({})}>
        <input name="name" value="" />
        <span>{userForm.error('name')}</span>
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
  expect(obj).toEqual({ name: 'Alice', age: '30' }); // schema coercion happens in validation step
});

// IT-3-4: attrs() returns action and method from SDK metadata
test('attrs() returns correct action and method', () => {
  const userForm = form(api.users.create, { schema: createUserBodySchema });
  const attrs = userForm.attrs();
  expect(attrs.action).toContain('/users');
  expect(attrs.method).toBe('POST');
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
