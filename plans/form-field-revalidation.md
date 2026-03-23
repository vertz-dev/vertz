# Form Field Revalidation

**Issue:** [#1746](https://github.com/vertz-dev/vertz/issues/1746) — form field errors should re-validate on blur after submit

## Problem

After submitting a form with validation errors, fixing a field and blurring it does not clear the error. The user must re-submit the entire form to see updated validation state. This is a poor UX — users expect immediate feedback when they correct a mistake.

The `focusout` handler currently sets `field.touched = true` but runs no validation. The `input`/`change` handler updates `field.value` and `field.dirty` but also runs no validation.

## Breaking Change

**This changes the default form behavior.** Previously, blur/change events only tracked state (`touched`, `value`, `dirty`). After this change, blur events also trigger revalidation for fields with prior errors.

This is a deliberate UX improvement. All packages are pre-v1. Existing forms get better behavior automatically — no migration needed. Developers who want the old behavior can opt out with `revalidateOn: 'submit'`.

## API Surface

### `revalidateOn` option

```ts
// Default — revalidate on blur (after first submit with errors)
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  onSuccess: handleSuccess,
});

// Explicit blur (same as default)
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  revalidateOn: 'blur',
});

// Revalidate on every keystroke (after first submit with errors)
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  revalidateOn: 'change',
});

// No revalidation — only validate on submit (previous default behavior)
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  revalidateOn: 'submit',
});
```

### Behavior contract

1. **First validation** is always on submit — `revalidateOn` does NOT trigger validation before the first submit.
2. `hasSubmitted` is set to `true` as soon as `submitPipeline` is entered — **including when client-side validation fails**. This ensures revalidation activates after any submit attempt, not just successful ones.
3. After a submit with errors, fields that have errors are "flagged" for revalidation.
4. On blur (`revalidateOn: 'blur'`): flagged fields re-validate when the user blurs them. Covers `focusout` DOM events.
5. On change (`revalidateOn: 'change'`): flagged fields re-validate on every `input` and `change` DOM event. The `input` event fires on every keystroke; the `change` event fires on select/checkbox interactions.
6. If a flagged field now passes validation, the error is cleared immediately.
7. If a flagged field still fails, the error message updates to reflect the current error.
8. Fields without errors are NOT validated on blur/change — no premature validation on first touch.
9. `form.reset()` clears the `hasSubmitted` flag — a reset form returns to its initial state where no revalidation fires until the next submit.

### Single-field validation

When a schema exposes `.shape` (e.g., `@vertz/schema` ObjectSchema), `form()` validates only the specific field that was blurred/changed. This is more performant and avoids false positives from cross-field refinements running against partial data.

When a schema only exposes `.parse()` (generic `FormSchema<T>`), `form()` falls back to full-form validation and extracts the specific field's error. This ensures compatibility with any schema library.

```ts
// @vertz/schema — single-field path (preferred)
const schema = s.object({ title: s.string().min(1), priority: s.enum(['low', 'high']) });
// On blur of 'title': runs schema.shape['title'].parse(value) — fast, isolated

// Generic schema — full validation fallback
const customSchema: FormSchema<{ title: string }> = { parse(data) { ... } };
// On blur of 'title': runs schema.parse(fullData) + extracts title error
```

**Nested field traversal with wrappers:** When traversing `schema.shape.address.shape.street`, intermediate schemas may be wrapped in `OptionalSchema` or `DefaultSchema` (which don't expose `.shape`). The `validateField()` function must unwrap these — check for a `.wrapped` or `.innerType` property and descend into the underlying schema. If unwrapping fails at any level, fall back to full-form validation.

**Duck-typing safety:** The `.shape` check verifies both that `schema.shape` exists AND that `schema.shape[fieldName]` has a `.parse()` method. This prevents false positives from custom schemas with coincidental `.shape` properties.

**Fallback `fullData` assembly:** When falling back to full-form validation, `fullData` is assembled from the current `fieldCache` values: `Object.fromEntries([...fieldCache.entries()].map(([k, f]) => [k, f.value.peek()]))`. This reconstructs the form state from tracked field values. **Known limitation:** fields the user has never interacted with (no `input`/`change` event and no initial value) will be `undefined` in this reconstruction, which may cause different validation results than a full FormData-based submit. This is acceptable because the fallback only fires for schemas without `.shape` — which is a minority case — and the next full submit always validates from fresh FormData.

## Manifesto Alignment

- **"One way to do things"** — The default (`'blur'`) gives the best UX for the vast majority of forms. Developers opt in to alternatives only if their use case demands it.
- **"If it builds, it works"** — `revalidateOn` is a typed string union. The compiler rejects invalid values.
- **"AI agents are first-class users"** — The default just works. An LLM generating a form doesn't need to know about `revalidateOn` unless the user asks for a specific behavior.
- **"Explicit over implicit"** — The option is a simple enum, not a boolean pair. Its meaning is unambiguous.

## Non-Goals

- **`validateOn` (first-touch validation before submit)** — A separate concern. If needed later, it can be added as a distinct option without conflicting with `revalidateOn`.
- **Async field validation (debounced uniqueness checks, etc.)** — Async schema validation already works on submit. Async single-field revalidation is a future enhancement. Note: for `revalidateOn: 'change'` with the fallback full-validation path, no debounce is applied — this is synchronous O(fields) work per keystroke, which is acceptable for v0.1.x but should be revisited if forms grow large.
- **Cross-field revalidation** — When field A's value affects field B's validity (e.g., confirm password), only the specifically blurred/changed field is revalidated. Cross-field constraints are caught on the next submit. This is the standard behavior in React Hook Form and Formik.
- **`revalidateOn` per field** — A single form-level option is sufficient. Per-field granularity is over-engineering for the current use case.
- **Combined blur+change mode ("show error on blur, clear on change")** — This is a distinct UX pattern where errors appear on blur but clear as soon as the user starts typing. It's a valid UX choice but requires separate tracking of "show" vs "clear" triggers. Deferred to a future `clearErrorOn` option if demand materializes. The current `'change'` mode provides the closest behavior (errors update on every keystroke).

## Unknowns — Resolved

1. **Nested shape traversal with `OptionalSchema`/`DefaultSchema` wrappers** — Resolved: `validateField()` will unwrap intermediate wrappers by checking for `.wrapped` or `.innerType` properties. If no unwrap path exists, fall back to full validation. See "Nested field traversal with wrappers" above.
2. **`reset()` interaction with `hasSubmitted`** — Resolved: `form.reset()` clears `hasSubmitted` to `false`. A reset form behaves as if it was never submitted. See behavior contract point 9.

## Type Flow Map

```
FormOptions<TBody, TResult>
  └─ revalidateOn: 'submit' | 'blur' | 'change'  (optional, default 'blur')
       └─ read in form() closure
            ├─ handleFocusout() — checks revalidateOn !== 'submit' && hasSubmitted && field.error !== undefined
            └─ handleInputOrChange() — checks revalidateOn === 'change' && hasSubmitted && field.error !== undefined

form() closure internal state:
  └─ hasSubmitted: boolean (plain let, NOT a signal — read synchronously in event handlers)
       ├─ set true at top of submitPipeline() (before validation)
       └─ set false in resetForm()

FormSchema<T> (duck-typed single-field path)
  └─ .shape?[fieldName] (check .parse exists on result)
       └─ traverse: unwrap OptionalSchema/DefaultSchema at each level
            └─ Schema.parse(fieldValue) → ok/error
  └─ .parse(fullData from fieldCache) → ValidationResult<T> → extract field error
```

No new generics. `revalidateOn` is a plain string option, not a type parameter.

## E2E Acceptance Test

```ts
describe('Feature: Form field revalidation', () => {
  // --- revalidateOn: 'blur' (default) ---

  describe('Given a form with revalidateOn: blur (default)', () => {
    describe('When submitting with an empty required field', () => {
      it('Then shows the field error', async () => {
        const schema = s.object({ title: s.string().min(1) });
        const f = form(sdk, { schema });
        await f.submit(formDataWith({ title: '' }));
        expect(f.title.error.peek()).toBe('String must be at least 1 character(s)');
      });
    });

    describe('When the user fixes the field value and blurs', () => {
      it('Then the error is cleared because the field now passes validation', () => {
        // ... submit with error, then simulate input + focusout
        // f.title.error.peek() === undefined
      });
    });

    describe('When the user blurs a field that still has an invalid value', () => {
      it('Then the error message updates to the current error', () => {
        // ... error persists or changes to match new value
      });
    });

    describe('When the user blurs a field that was never flagged with an error', () => {
      it('Then no validation runs (no premature errors)', () => {
        // f.description.error.peek() === undefined (never had an error)
      });
    });

    describe('When the user types but does not blur', () => {
      it('Then the error persists (blur required for revalidation)', () => {
        // ... input event alone does not trigger revalidation
      });
    });
  });

  // --- revalidateOn: 'change' ---

  describe('Given a form with revalidateOn: change', () => {
    describe('When the user fixes a flagged field via typing (input event)', () => {
      it('Then the error is cleared on input without needing blur', () => {
        // ... revalidation on every keystroke
      });
    });
  });

  // --- revalidateOn: 'submit' ---

  describe('Given a form with revalidateOn: submit', () => {
    describe('When the user fixes a field and blurs', () => {
      it('Then the error persists until the next submit', () => {
        // ... no revalidation on blur or change
      });
    });
  });

  // --- hasSubmitted boundary ---

  describe('Given a form that fails client-side validation on submit', () => {
    describe('When the user then fixes the field and blurs', () => {
      it('Then revalidation fires (hasSubmitted is set even on validation failure)', () => {
        // ... submit → validation fails → hasSubmitted = true → blur → error clears
      });
    });
  });

  // --- reset interaction ---

  describe('Given a form that was submitted with errors then reset', () => {
    describe('When the user blurs a field after reset', () => {
      it('Then no revalidation fires (hasSubmitted was cleared by reset)', () => {
        // ... reset clears hasSubmitted → blur does nothing
      });
    });
  });

  // --- Single-field validation ---

  describe('Given a schema with .shape (e.g., @vertz/schema)', () => {
    describe('When revalidating a single field on blur', () => {
      it('Then only that field is validated (not the full form)', () => {
        // ... verify via spy that schema.shape[field].parse is called
        // ... verify schema.parse is NOT called
      });
    });
  });

  describe('Given a schema with nested optional fields (.shape.address wraps OptionalSchema)', () => {
    describe('When revalidating address.street on blur', () => {
      it('Then unwraps OptionalSchema and validates via inner shape', () => {
        // ... verify nested traversal with unwrapping
      });
    });
  });

  describe('Given a generic schema without .shape', () => {
    describe('When revalidating a single field on blur', () => {
      it('Then full validation runs and the specific field error is extracted', () => {
        // ... verify schema.parse IS called
      });
    });
  });

  // --- Type safety ---

  // @ts-expect-error — invalid revalidateOn value
  form(sdk, { schema, revalidateOn: 'invalid' });
});
```

## Implementation Plan

### Phase 1: Single-field validation + `validateField()`

Add the per-field validation infrastructure to `validation.ts`.

**Changes:**
- `packages/ui/src/form/validation.ts` — add `validateField()` function with schema `.shape` duck-typing, nested traversal with `OptionalSchema`/`DefaultSchema` unwrapping, and full-validation fallback
- `packages/ui/src/form/__tests__/validation.test.ts` — tests

**Acceptance criteria:**

```ts
describe('Feature: Single-field validation', () => {
  describe('Given a schema with .shape (duck-typed)', () => {
    describe('When calling validateField(schema, "title", "")', () => {
      it('Then returns { valid: false, error: "..." } using shape[field].parse()', () => {});
    });

    describe('When calling validateField(schema, "title", "Hello")', () => {
      it('Then returns { valid: true, error: undefined }', () => {});
    });
  });

  describe('Given a schema without .shape', () => {
    describe('When calling validateField(schema, "title", "", currentFormData)', () => {
      it('Then runs full parse and extracts the title field error', () => {});
    });

    describe('When calling validateField(schema, "title", "Hello", currentFormData)', () => {
      it('Then returns valid (no error for that field in full parse result)', () => {});
    });
  });

  describe('Given a nested field path "address.street"', () => {
    describe('When calling validateField(schema, "address.street", "")', () => {
      it('Then navigates schema.shape.address.shape.street for validation', () => {});
    });
  });

  describe('Given a nested field wrapped in OptionalSchema', () => {
    describe('When calling validateField(schema, "address.street", "")', () => {
      it('Then unwraps OptionalSchema and validates via inner schema shape', () => {});
    });
  });

  describe('Given a nested field where intermediate unwrap fails', () => {
    describe('When calling validateField(schema, "address.street", "", formData)', () => {
      it('Then falls back to full validation and extracts the field error', () => {});
    });
  });

  describe('Given a schema with coincidental .shape but no .parse on field', () => {
    describe('When calling validateField(schema, "title", "")', () => {
      it('Then falls back to full validation (duck-type guard rejects)', () => {});
    });
  });
});
```

### Phase 2: `revalidateOn` option + blur/change revalidation

Wire `validateField()` into the form's event handlers and add the `revalidateOn` option.

**Changes:**
- `packages/ui/src/form/form.ts` — add `revalidateOn` to `FormOptions` (with JSDoc), add `hasSubmitted` flag (plain `let boolean`), update `handleFocusout` and `handleInputOrChange`, update `submitPipeline` to set `hasSubmitted = true` at entry, update `resetForm` to clear `hasSubmitted`
- `packages/ui/src/form/__tests__/form.test.ts` — tests for all revalidation modes
- `packages/ui/src/form/__tests__/form.test-d.ts` — type test for `revalidateOn`

**Acceptance criteria:**

```ts
describe('Feature: revalidateOn blur (default)', () => {
  describe('Given a form submitted with validation errors', () => {
    describe('When the user fixes the field and triggers focusout', () => {
      it('Then the field error is cleared', () => {});
    });

    describe('When the user changes value but field is still invalid and triggers focusout', () => {
      it('Then the field error updates to the new error message', () => {});
    });

    describe('When the user blurs a field with no prior error', () => {
      it('Then no validation runs', () => {});
    });

    describe('When the user types but does not blur', () => {
      it('Then the error persists', () => {});
    });
  });

  describe('Given a form that has not been submitted yet', () => {
    describe('When the user blurs a field', () => {
      it('Then no validation runs regardless of value', () => {});
    });
  });

  describe('Given a form submitted with client-side validation failure', () => {
    describe('When the user fixes the field and blurs', () => {
      it('Then revalidation fires (hasSubmitted was set at submit entry)', () => {});
    });
  });

  describe('Given a form that was reset after submit', () => {
    describe('When the user blurs a field', () => {
      it('Then no revalidation fires (hasSubmitted cleared by reset)', () => {});
    });
  });
});

describe('Feature: revalidateOn change', () => {
  describe('Given a form with revalidateOn: change and submitted errors', () => {
    describe('When the user types a valid value (input event)', () => {
      it('Then the field error is cleared immediately', () => {});
    });

    describe('When the user selects a valid option (change event on select)', () => {
      it('Then the field error is cleared immediately', () => {});
    });
  });
});

describe('Feature: revalidateOn submit', () => {
  describe('Given a form with revalidateOn: submit', () => {
    describe('When the user fixes a field and blurs', () => {
      it('Then the error persists', () => {});
    });

    describe('When the user fixes a field and types (input event)', () => {
      it('Then the error persists', () => {});
    });
  });
});
```

### Phase 3: Integration tests + docs

**Changes:**
- `packages/ui/src/__tests__/form-integration.test.ts` — end-to-end integration tests with `@vertz/schema` and real event simulation
- `packages/docs/` — update form API documentation with `revalidateOn` option
- Changeset

**Acceptance criteria:**

```ts
describe('Feature: Form revalidation E2E with @vertz/schema', () => {
  describe('Given a real @vertz/schema with form() and bound element', () => {
    describe('When submitting invalid data, fixing a field, and blurring (default blur mode)', () => {
      it('Then uses single-field validation via .shape and clears the error', () => {});
    });
  });

  describe('Given revalidateOn: change with @vertz/schema and bound element', () => {
    describe('When submitting invalid data and then typing a valid value', () => {
      it('Then the error clears on input event', () => {});
    });
  });

  describe('Given revalidateOn: submit with @vertz/schema and bound element', () => {
    describe('When submitting invalid data and blurring the corrected field', () => {
      it('Then the error persists until re-submit', () => {});
    });
  });

  describe('Given a generic FormSchema without .shape and bound element', () => {
    describe('When submitting invalid data and blurring a corrected field', () => {
      it('Then falls back to full validation and clears the field error', () => {});
    });
  });

  describe('Given a nested optional field schema with bound element', () => {
    describe('When submitting invalid nested data and blurring the corrected field', () => {
      it('Then unwraps OptionalSchema and revalidates the nested field', () => {});
    });
  });
});
```
