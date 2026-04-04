# Form-Level onChange with Per-Input Debounce

**Issue:** #2151
**Status:** Rev 2 (post-review)
**Date:** 2026-04-04

## Summary

Add an `onChange` callback to `<form>` that fires when any child input changes, with per-input debounce configuration via a compiler-transformed `debounce` prop on `<input>` and `<textarea>` elements.

**Breaking change:** `<form onChange={handler}>` changes from a raw DOM `change` event listener to the enhanced form-level change handler. Pre-v1, breaking changes are encouraged per policy.

---

## 1. API Surface

### Basic usage — search/filter form

```tsx
import { Input } from '@vertz/ui/components';

function SearchFilters() {
  const { navigate } = useRouter();

  function handleFiltersChange(values: FormValues) {
    navigate({ to: '/tasks', search: { q: values.q, status: values.status } });
  }

  return (
    <form onChange={handleFiltersChange}>
      <Input name="q" debounce={300} placeholder="Search..." />
      <select name="status">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="done">Done</option>
      </select>
    </form>
  );
}
```

**Behavior:**
- Typing in the search input fires `handleFiltersChange` after 300ms of inactivity (debounced)
- Selecting a status fires `handleFiltersChange` immediately (no debounce)
- `handleFiltersChange` receives ALL current form values as a plain object

### Reactive debounce value

```tsx
let debounceMs = 300;

<form onChange={handleChange}>
  <input name="q" debounce={debounceMs} />
</form>
```

The `debounce` prop supports reactive expressions. The compiler wraps it in a getter so changes to the debounce duration take effect on the next keystroke.

### With `form()` API

```tsx
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  onSuccess: (task) => navigate({ to: `/tasks/${task.id}` }),
});

return (
  <form
    action={taskForm.action}
    method={taskForm.method}
    onSubmit={taskForm.onSubmit}
    onChange={(values) => console.log('Live values:', values)}
  >
    <Input name="title" debounce={200} />
    <Textarea name="description" debounce={500} />
    <Button type="submit">Create</Button>
  </form>
);
```

**Interaction with `form()`:** `onChange` and `form()` are independent and both fire from the same form element. `form()` field signals (e.g., `taskForm.title.value`) update on **every keystroke** regardless of `debounce`. The `debounce` prop only controls the timing of the `onChange` callback. `form()` handles validation and submission; `onChange` handles live value snapshots.

### FormValues type

```tsx
/** Point-in-time snapshot of form values collected via FormData. */
export interface FormValues {
  [key: string]: string;
}
```

`FormValues` is a simple string record built from `new FormData(form)`. For typed values, users destructure and coerce in their handler:

```tsx
function handleChange(values: FormValues) {
  const q = values.q ?? '';
  const page = Number(values.page) || 1;
}
```

**Known limitations of string-only FormValues:**
- **Unchecked checkboxes** are absent from `FormData` — the key is missing, not `"false"`. Check `values.terms !== undefined`.
- **Multi-select / checkbox groups** with duplicate `name` attributes: only the last value is included (same as `formDataToObject`). For multi-value scenarios, use `new FormData(formEl)` directly via a `ref`.
- **`<input type="number">`** produces a string. Coerce in your handler.

### Native escape hatch

If you need the raw DOM `change` event on a `<form>` (rare), use a ref:

```tsx
function FormWithRawChange() {
  const formRef = ref<HTMLFormElement>();

  onMount(() => {
    formRef.current?.addEventListener('change', (e) => {
      console.log('Raw change event:', e);
    });
  });

  return <form ref={formRef}>...</form>;
}
```

### Native elements — compiler transform

```tsx
// Input: developer writes
<input name="q" debounce={300} />

// Output: compiler produces
const __el1 = __element("input");
__el1.setAttribute("name", "q");
__el1.setAttribute("data-vertz-debounce", "300");
```

The compiler strips the `debounce` prop and emits a `data-vertz-debounce` data attribute. This attribute is read by the form's `onChange` runtime handler.

For reactive debounce values:

```tsx
// Input:
<input name="q" debounce={debounceMs} />

// Output:
const __el1 = __element("input");
__el1.setAttribute("name", "q");
__attr(__el1, "data-vertz-debounce", () => String(debounceMs));
```

The compiler recognizes `debounce` on `<input>`, `<textarea>`, and `<select>` elements and transforms it to `data-vertz-debounce`. On any other element, `debounce` is passed through as a regular attribute (and TypeScript will not provide autocomplete for it — see JSX types below).

### Form onChange — compiler transform

```tsx
// Input: developer writes
<form onChange={handleChange}>

// Output: compiler produces
const __el0 = __element("form");
__formOnChange(__el0, handleChange);
```

The compiler recognizes `onChange` on `<form>` elements and replaces it with a `__formOnChange` runtime helper call instead of a regular `__on(__el, "change", handler)` event binding.

### Theme components — prop forwarding

The `<Input>` and `<Textarea>` theme components accept a `debounce` prop and forward it as `data-vertz-debounce` to the underlying native element:

```tsx
// In ui-primitives — ComposedInputRoot
export interface ComposedInputProps {
  // ... existing props ...
  debounce?: number;
  [key: string]: unknown;
}

function ComposedInputRoot({ classes, className, class: classProp, debounce, ...props }: ComposedInputProps) {
  return (
    <input
      class={cn(classes?.base, className ?? classProp)}
      data-vertz-debounce={debounce}
      {...props}
    />
  );
}
```

### JSX type additions

The `onChange` on `<form>` has a different signature than the native DOM `change` event. This is expressed via a form-specific type override in the JSX types:

```tsx
// In packages/ui/src/jsx-runtime/index.ts

/** Point-in-time snapshot of form values collected via FormData. */
export interface FormValues {
  [key: string]: string;
}

export interface FormHTMLAttributes extends HTMLAttributes {
  /** Enhanced form-level change handler. Receives all current form values as a plain object.
   * Respects per-input `debounce` props for timing control.
   * This is NOT the native DOM `change` event — use a ref + addEventListener for that. */
  onChange?: (values: FormValues) => void;
}

export interface InputHTMLAttributes extends HTMLAttributes {
  /** Debounce delay in milliseconds for the form-level onChange callback.
   * Only effective when the input is inside a <form onChange={...}>. */
  debounce?: number;
}

export interface TextareaHTMLAttributes extends HTMLAttributes {
  debounce?: number;
}

export namespace JSX {
  export interface IntrinsicElements {
    form: FormHTMLAttributes;
    input: InputHTMLAttributes;
    textarea: TextareaHTMLAttributes;
    // ... other elements use HTMLAttributes
    [key: string]: HTMLAttributes | undefined;
  }
}
```

This makes the type-level distinction visible: `onChange` on `<form>` accepts `(values: FormValues) => void`, not `(e: Event) => void`. TypeScript catches the mismatch at compile time.

---

## 2. Manifesto Alignment

### One way to do things (Principle 2)
This is **the** way to do form-level change tracking in Vertz. No controlled inputs, no manual `addEventListener`, no custom hooks. Write `onChange` on the form, add `debounce` where needed.

### AI agents are first-class users (Principle 3)
An LLM sees `<form onChange={handler}>` and `debounce={300}` and knows exactly what happens. No framework-specific hooks to learn, no magic — just props on HTML elements. The pattern is immediately guessable from React/Vue experience.

### If it builds, it works (Principle 1)
The `debounce` prop is typed on `InputHTMLAttributes` and `TextareaHTMLAttributes` only — not all elements. The `onChange` on `<form>` has a specific `FormHTMLAttributes` type with `(values: FormValues) => void`. If you write `debounce="fast"`, TypeScript catches it. If you write `<form onChange={(e: Event) => ...}>`, TypeScript catches the signature mismatch.

### No ceilings (Principle 8)
The compiler handles the `debounce` transform — users don't need wrapper components or HOCs. The framework enriches native form behavior without adding abstraction layers. Raw DOM escape hatch is documented for advanced cases.

### What was rejected

1. **Controlled inputs with onChange per-input** — Causes verbosity, bugs (focus loss #2140), and fights the browser's native form model. Every other framework regrets this path.

2. **`useDebounce()` hook** — Forces users to wire up debouncing manually per input. Violates "one way to do things" — different developers would debounce differently.

3. **Form-level debounce (single value for all inputs)** — Too coarse. Search inputs need 300ms, selects need 0ms. Per-input debounce is the right granularity.

4. **`onChange` as a `form()` option** — `onChange` on the JSX element is more discoverable and works without `form()`. The `form()` API focuses on validation/submission. Live change tracking is a separate concern. `form()` will NOT gain an `onChange` option — the two are orthogonal by design.

---

## 3. Non-Goals

- **Typed form values from JSX children** — Inferring `{ q: string; status: string }` from child `name` props is not feasible at the TypeScript level. Users type-narrow in their handler.
- **Debounce on non-form elements** — `debounce` is typed and compiler-transformed only on `<input>`, `<textarea>`, and `<select>` (and their theme wrappers). No general-purpose debounce directive.
- **Cancel/flush API** — No imperative `cancelDebounce()` or `flushDebounce()`. If you need that level of control, use a manual debounce utility.
- **Per-field change callbacks** — `onChange` fires at the form level with ALL values. No per-input `onChange` enrichment.
- **File input support** — `FormValues` only includes string values. File inputs are skipped (same as `formDataToObject`).
- **Multi-value support** — `<select multiple>` and checkbox groups with the same `name` only include the last value. For multi-value access, use `new FormData(formEl).getAll(name)` via a ref.
- **Value coercion** — `FormValues` is always `Record<string, string>`. No automatic coercion to numbers/booleans. Users coerce in their handler.
- **ContentEditable / custom web components** — `contenteditable` divs and web components that don't fire native `input` events are not supported. Only standard form elements participate.
- **Nested value output** — Forms with `name="address.street"` produce flat keys (`{ "address.street": "..." }`), not nested objects. Use `formDataToObject(fd, { nested: true })` directly if needed.

---

## 4. Unknowns

### Resolved

**Q: Should `onChange` on `<form>` override the native DOM `change` event?**
A: Yes. The compiler treats `onChange` on `<form>` specially — it generates `__formOnChange` instead of `__on(el, "change", handler)`. This is a **breaking change** for anyone using `<form onChange={(e) => ...}>` to get a raw DOM event. Since we are pre-v1, this is acceptable per policy. The escape hatch is `ref` + `addEventListener`. The JSX types make the signature change visible at compile time (`FormHTMLAttributes.onChange` takes `FormValues`, not `Event`).

**Q: How do we avoid double-firing when both `input` and `change` events occur?**
A: Listen to `input` events only. Modern browsers fire the `input` event for ALL form elements — text inputs, textareas, selects, checkboxes, and radios (per HTML Living Standard). This eliminates the `input`-on-keystroke + `change`-on-blur double-fire problem entirely. Additionally, listen to `reset` events to handle `form.reset()`.

**Q: What happens when a non-debounced select changes while a debounced input timer is pending?**
A: The immediate flush **cancels all pending debounce timers**. The flush already reads ALL current form values (including the in-flight input value), so the pending timer would deliver identical data. One interaction → one callback. No redundant fires.

**Q: What about `debounce={0}`?**
A: `debounce={0}` is equivalent to no debounce — the handler fires immediately via microtask batching. The compiler still emits `data-vertz-debounce="0"`, but the runtime treats `0` as non-debounced.

**Q: What about radio buttons sharing a `name`?**
A: Debounce timers are keyed by `name`. Clicking radio A, then quickly clicking radio B (same name) resets the timer. This is correct — only the final selection fires after the debounce period.

### Open — none identified

---

## 5. POC Results

No POC required. The design uses well-understood primitives:
- DOM event delegation (already used by `form()` via `__bindElement`)
- `data-*` attributes for configuration (standard pattern)
- Compiler prop stripping (same pattern as `key` prop)
- `setTimeout`/`clearTimeout` for debounce (trivial)

The risk is low — this is a new runtime helper + small compiler addition, not an architectural change.

---

## 6. Type Flow Map

```
Developer writes:             debounce={300}
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
            Native <input>               <Input> component
                    │                           │
       InputHTMLAttributes.debounce   ComposedInputProps.debounce?: number
            Compiler strips                     │
            debounce prop             Forwarded as data-vertz-debounce
                    │                           │
            data-vertz-debounce="300"   data-vertz-debounce={debounce}
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                    __formOnChange reads data-vertz-debounce
                    from event.target at runtime (parseInt)
                                  │
                    FormValues built from new FormData(form)
                    → formDataToObject() → Record<string, string>
                                  │
                    onChange handler: (values: FormValues) => void
                    (typed via FormHTMLAttributes.onChange)
```

```
Developer writes:     <form onChange={handleChange}>
                              │
                      FormHTMLAttributes.onChange
                      types handler as (values: FormValues) => void
                              │
                      Compiler: __formOnChange(__el, handleChange)
                      (not __on(__el, "change", handleChange))
                              │
                      Runtime: listens to 'input' + 'reset' events
                      Debounce or microtask flush → collectValues() → handler
```

**Generics:** None. `FormValues` is a simple `Record<string, string>`. No generics flow through this feature.

**Type boundaries:**
- `debounce` prop: `number` (compile-time, typed on `InputHTMLAttributes`) → `string` (DOM attribute) → `number` (runtime `parseInt`)
- `onChange` handler: `(values: FormValues) => void` (typed on `FormHTMLAttributes`) — the compiler generates the `__formOnChange` call

---

## 7. E2E Acceptance Test

```tsx
import { describe, it, expect } from 'vitest';

describe('Feature: Form-level onChange with per-input debounce', () => {

  describe('Given a form with onChange and mixed inputs', () => {
    // Setup: <form onChange={spy}>
    //          <input name="q" debounce={300} />
    //          <select name="status"><option value="all">...</option></select>
    //        </form>

    describe('When the user types in a debounced input', () => {
      it('Then onChange does NOT fire immediately', () => {
        // Type "hello" → spy not called yet
      });

      it('Then onChange fires after the debounce period with all form values', () => {
        // Wait 300ms → spy called once with { q: "hello", status: "all" }
      });
    });

    describe('When the user types rapidly in a debounced input', () => {
      it('Then onChange fires only once after typing stops', () => {
        // Type "h", "e", "l", "l", "o" rapidly → spy called once after 300ms
        // with { q: "hello", status: "all" }
      });
    });

    describe('When the user changes a non-debounced select', () => {
      it('Then onChange fires immediately with all form values', () => {
        // Select "active" → spy called immediately with { q: "", status: "active" }
      });
    });

    describe('When the user types in debounced input then immediately changes select', () => {
      it('Then onChange fires once with all current values (pending debounce canceled)', () => {
        // Type "hel" in input → select "active"
        // → spy fires ONCE with { q: "hel", status: "active" }
        // Pending debounce timer for "q" is canceled by the immediate flush
      });
    });
  });

  describe('Given a form with onChange and no debounce props', () => {
    describe('When any input changes', () => {
      it('Then onChange fires immediately for every input event', () => {
        // No debounce → every input event fires handler via microtask
      });
    });
  });

  describe('Given a form without onChange', () => {
    describe('When inputs have debounce props', () => {
      it('Then debounce attributes are set on DOM but no handler fires', () => {
        // data-vertz-debounce is set, but no __formOnChange is wired
      });
    });
  });

  // form.reset() handling
  describe('Given a form with onChange', () => {
    describe('When form.reset() is called', () => {
      it('Then onChange fires with the reset values', () => {
        // Type "hello" → form.reset() → spy fires with { q: "", status: "all" }
      });
    });
  });

  // Checkbox behavior
  describe('Given a form with onChange and a checkbox', () => {
    describe('When the checkbox is checked', () => {
      it('Then onChange includes the checkbox value', () => {
        // Check box → spy fires with { ..., terms: "on" }
      });
    });

    describe('When the checkbox is unchecked', () => {
      it('Then onChange excludes the checkbox key (absent from FormData)', () => {
        // Uncheck box → spy fires with { ... } (no "terms" key)
      });
    });
  });

  // Radio buttons
  describe('Given a form with radio buttons sharing a name', () => {
    describe('When the user clicks radios rapidly', () => {
      it('Then debounce timer resets on each click (keyed by name)', () => {
        // Click "a" → click "b" → wait debounce → spy fires once with final value
      });
    });
  });

  // Interaction with form()
  describe('Given a form using both form() and onChange', () => {
    describe('When the user types in a debounced input', () => {
      it('Then form() field signals update immediately (every keystroke)', () => {
        // form().title.value updates on each keystroke
      });

      it('Then onChange fires only after debounce period', () => {
        // onChange spy fires once after debounce
      });
    });
  });

  // Compiler transform tests
  describe('Given <input debounce={300} />', () => {
    it('Then the compiler strips debounce and emits data-vertz-debounce="300"', () => {
      // Verify compiled output: setAttribute("data-vertz-debounce", "300")
    });
  });

  describe('Given <form onChange={handler}>', () => {
    it('Then the compiler emits __formOnChange(el, handler)', () => {
      // Verify compiled output: __formOnChange(__el0, handler)
      // NOT: __on(__el0, "change", handler)
    });
  });

  describe('Given <div debounce={300}>', () => {
    it('Then the compiler passes through debounce as a regular attribute', () => {
      // No special transform — debounce is not recognized on <div>
    });
  });

  // Type-level tests (.test-d.ts)
  describe('Type safety', () => {
    it('debounce must be a number', () => {
      // @ts-expect-error — debounce must be a number
      // <input debounce="fast" />
    });

    it('form onChange receives FormValues not Event', () => {
      // @ts-expect-error — onChange on form is (values: FormValues) => void
      // <form onChange={(e: Event) => e.preventDefault()} />
    });

    it('form onChange handler can destructure values', () => {
      // Valid: <form onChange={(values) => console.log(values.q)} />
    });
  });

  // Cleanup
  describe('Given a form with onChange that is removed from the DOM', () => {
    it('Then all debounce timers are cleared and event listeners are removed', () => {
      // Mount form → type (start debounce) → unmount → no handler fires
    });
  });

  // SSR
  describe('Given SSR rendering a form with onChange and debounce', () => {
    it('Then data-vertz-debounce attributes appear in SSR HTML', () => {
      // SSR output includes data-vertz-debounce="300" on input elements
    });

    it('Then __formOnChange is a no-op during SSR (no DOM events)', () => {
      // Server-side: no event listeners attached, no errors
    });
  });
});
```

---

## Implementation Approach

### Compiler changes (Rust — `jsx_transformer.rs`)

1. **`debounce` prop on `<input>`, `<textarea>`, and `<select>`:**
   - In `process_attr()`, detect `debounce` attribute when `tag_name` is `input`, `textarea`, or `select`
   - Transform to `data-vertz-debounce` attribute (same static/reactive handling as any other attr)
   - Strip the original `debounce` name so it doesn't appear as a DOM attribute
   - On any other element, `debounce` passes through as-is (no special handling)

2. **`onChange` on `<form>`:**
   - In `process_attr()`, detect `onChange` when `tag_name` is `form`
   - Generate `__formOnChange(el_var, handler)` instead of `__on(el_var, "change", handler)`

3. **Import injection (`import_injection.rs`):**
   - Add `__formOnChange` to `DOM_HELPERS` list

### Runtime changes (`packages/ui/src/dom/`)

4. **New file: `form-on-change.ts`:**

```ts
import { _tryOnCleanup } from '../runtime/disposal';
import { formDataToObject } from '../form/form-data';

/** Point-in-time snapshot of form values collected via FormData. */
export interface FormValues {
  [key: string]: string;
}

/**
 * Wire up form-level onChange with per-input debounce.
 *
 * - Listens to `input` events on the form via delegation (covers all form elements
 *   per HTML Living Standard: text inputs, textareas, selects, checkboxes, radios).
 * - Listens to `reset` events to detect form.reset().
 * - Reads `data-vertz-debounce` from the event target to determine delay.
 * - Non-debounced events are coalesced via microtask batching.
 * - An immediate flush cancels all pending debounce timers (their values are
 *   already included in the flush).
 *
 * During SSR, this is a no-op (event listeners are not functional on the DOM shim).
 */
export function __formOnChange(
  form: HTMLFormElement,
  handler: (values: FormValues) => void,
): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let pendingFlush = false;

  function collectValues(): FormValues {
    return formDataToObject(new FormData(form)) as FormValues;
  }

  function flush(): void {
    pendingFlush = false;
    // Cancel all pending debounce timers — their values are included in this flush
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    handler(collectValues());
  }

  function scheduleFlush(): void {
    if (!pendingFlush) {
      pendingFlush = true;
      queueMicrotask(flush);
    }
  }

  function handleInput(e: Event): void {
    const target = e.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }
    const name = target.name;
    if (!name) return;

    const debounceAttr = target.getAttribute('data-vertz-debounce');
    const debounceMs = debounceAttr ? parseInt(debounceAttr, 10) : 0;

    if (debounceMs > 0) {
      // Clear existing timer for this input name
      const existing = timers.get(name);
      if (existing != null) clearTimeout(existing);

      timers.set(
        name,
        setTimeout(scheduleFlush, debounceMs),
      );
    } else {
      // No debounce — schedule microtask flush
      scheduleFlush();
    }
  }

  function handleReset(): void {
    // reset event fires before values are cleared — flush on next microtask
    scheduleFlush();
  }

  form.addEventListener('input', handleInput);
  form.addEventListener('reset', handleReset);

  const cleanup = () => {
    form.removeEventListener('input', handleInput);
    form.removeEventListener('reset', handleReset);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  _tryOnCleanup(cleanup);
  return cleanup;
}
```

**Key design decisions in the runtime:**

- **`input` event only, no `change`:** Modern browsers fire `input` for all form elements (text, select, checkbox, radio). Listening to `input` only eliminates the double-fire problem where text inputs would fire both `input` (on keystroke) and `change` (on blur).
- **Immediate flush cancels pending timers:** When a non-debounced event triggers a flush, all pending debounce timers are canceled. The flush already reads ALL form values, so the pending timers would deliver identical data. One interaction → one callback.
- **Timer path goes through `scheduleFlush()`:** Both debounced and non-debounced paths use `scheduleFlush()` to prevent the timer/microtask race condition where both would call the handler.
- **Element type checking via `instanceof`:** Explicit `HTMLInputElement`/`HTMLTextAreaElement`/`HTMLSelectElement` checks instead of the fragile `'name' in target` pattern. Ignores `contenteditable` divs, custom elements, and other non-form elements.
- **`reset` event handling:** `form.reset()` doesn't fire `input`/`change` events. The `reset` event fires before values are cleared, so we schedule a microtask flush to read the reset values.

5. **Export from internals:**
   - Add `__formOnChange` to `packages/ui/src/internals.ts`
   - Export `FormValues` from `packages/ui/src/index.ts` (public type)

### Type changes

6. **JSX types (`packages/ui/src/jsx-runtime/index.ts`):**
   - Add `FormHTMLAttributes` with `onChange?: (values: FormValues) => void`
   - Add `InputHTMLAttributes` with `debounce?: number`
   - Add `TextareaHTMLAttributes` with `debounce?: number`
   - Update `IntrinsicElements` to use specific types for `form`, `input`, `textarea`

7. **Primitives (`packages/ui-primitives/src/`):**
   - Add `debounce?: number` to `ComposedInputProps` and `ComposedTextareaProps`
   - Forward as `data-vertz-debounce` attribute

---

## SSR Behavior

During SSR, `__formOnChange` is a no-op — event listeners are not functional on the DOM shim. The `data-vertz-debounce` attributes are rendered in SSR HTML output (visible in source, useful for debugging). Event listeners are attached during hydration when the component mounts client-side.

---

## Phase Breakdown (preliminary)

**Phase 1: Runtime `__formOnChange` helper + unit tests**
- `form-on-change.ts` with full test coverage (debounce, flush, cleanup, reset, edge cases)
- `FormValues` type definition
- Export from internals and public API

**Phase 2: Compiler transforms + compiler tests**
- `debounce` → `data-vertz-debounce` transform in `jsx_transformer.rs` (input/textarea/select only)
- `onChange` on `<form>` → `__formOnChange` transform
- Import injection for `__formOnChange`
- Compiler test suite

**Phase 3: Type definitions + theme component integration**
- `FormHTMLAttributes`, `InputHTMLAttributes`, `TextareaHTMLAttributes` JSX types
- `ComposedInputProps`/`ComposedTextareaProps` debounce prop
- Theme component forwarding
- Type-level tests (`.test-d.ts`)

**Phase 4: Integration test + docs**
- E2E acceptance test (developer walkthrough with public imports)
- Documentation in `packages/docs/`
- Changeset
