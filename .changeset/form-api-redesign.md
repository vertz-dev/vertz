---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

**BREAKING:** Redesign `form()` API — direct properties, per-field signals, and compiler-assisted DOM binding.

### Removed
- `form().attrs()` — use direct properties: `form.action`, `form.method`, `form.onSubmit`
- `form().error(field)` — use per-field signals: `form.title.error`
- `form().handleSubmit(callbacks)` — use `form.submit(formData?)` and pass callbacks via `FormOptions`
- `SubmitCallbacks` type — merged into `FormOptions` (`onSuccess`, `onError`, `resetOnSuccess`)

### Added
- Direct properties: `action`, `method`, `onSubmit`, `reset`, `setFieldError`, `submit`
- Per-field reactive state via Proxy: `form.<field>.error`, `.dirty`, `.touched`, `.value`
- Form-level computed signals: `form.dirty`, `form.valid`
- `FieldState<T>` type and `createFieldState()` factory
- `__bindElement(el)` for compiler-assisted DOM event delegation
- 3-level signal auto-unwrap in compiler: `form.title.error` → `.value`
- `__bindElement` transform in JSX compiler for `<form>` elements

### Migration
```diff
- const { action, method, onSubmit } = todoForm.attrs({ onSuccess, resetOnSuccess: true });
+ const todoForm = form(sdk, { schema, onSuccess, resetOnSuccess: true });

- effect(() => { titleError = todoForm.error('title') ?? ''; });
+ {todoForm.title.error}

- formEl.addEventListener('submit', todoForm.handleSubmit({ onSuccess, onError }));
+ <form onSubmit={todoForm.onSubmit}>
```
