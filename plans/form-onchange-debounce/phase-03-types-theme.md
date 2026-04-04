# Phase 3: JSX Types + Theme Component Integration

## Context

This is the third phase of the form-level onChange with per-input debounce feature (#2151). This phase adds TypeScript type definitions for the new API surface and integrates the `debounce` prop into the theme component layer.

Phase 2 (compiler transforms) must be complete before this phase.

Design doc: `plans/form-onchange-debounce.md`

## Tasks

### Task 1: JSX type definitions

**Files:**
- `packages/ui/src/jsx-runtime/index.ts` (modified)
- `packages/ui/src/jsx-runtime/__tests__/form-onchange-types.test-d.ts` (new)

**What to implement:**

1. Import `FormValues` at the top of `packages/ui/src/jsx-runtime/index.ts`:
   ```ts
   import type { FormValues } from '../dom/form-on-change';
   ```

2. Inside the `JSX` namespace, add element-specific attribute interfaces:

   ```ts
   export interface FormHTMLAttributes extends HTMLAttributes {
     /** Enhanced form-level change handler. Receives all current form values.
      * Respects per-input `debounce` props for timing control.
      * This is NOT the native DOM `change` event. */
     onChange?: (values: FormValues) => void;
   }

   export interface InputHTMLAttributes extends HTMLAttributes {
     /** Debounce delay in ms for the form-level onChange callback.
      * Only effective inside a <form onChange={...}>. */
     debounce?: number;
   }

   export interface TextareaHTMLAttributes extends HTMLAttributes {
     debounce?: number;
   }

   export interface SelectHTMLAttributes extends HTMLAttributes {
     debounce?: number;
   }
   ```

3. Update `IntrinsicElements` to use the specific types:
   ```ts
   export interface IntrinsicElements {
     form: FormHTMLAttributes;
     input: InputHTMLAttributes;
     textarea: TextareaHTMLAttributes;
     select: SelectHTMLAttributes;
     [key: string]: HTMLAttributes | undefined;
   }
   ```

   Note: The `[key: string]` catch-all index signature must remain for arbitrary HTML elements. The specific entries for `form`, `input`, `textarea`, `select` provide narrower types for those elements.

4. Re-export `FormValues` from the JSX runtime module so it is accessible:
   ```ts
   export type { FormValues } from '../dom/form-on-change';
   ```

**Type-level tests (.test-d.ts):**

```typescript
import { describe, it, expectTypeOf } from 'vitest';

describe('Type: form onChange', () => {
  it('accepts (values: FormValues) => void', () => {
    // <form onChange={(values) => console.log(values.q)} /> ✓
  });

  it('rejects (e: Event) => void', () => {
    // @ts-expect-error — onChange on form takes FormValues, not Event
    // <form onChange={(e: Event) => e.preventDefault()} />
  });
});

describe('Type: input debounce', () => {
  it('accepts number', () => {
    // <input debounce={300} /> ✓
  });

  it('rejects string', () => {
    // @ts-expect-error — debounce must be a number
    // <input debounce="fast" />
  });
});

describe('Type: textarea debounce', () => {
  it('accepts number', () => {
    // <textarea debounce={500} /> ✓
  });
});

describe('Type: select debounce', () => {
  it('accepts number', () => {
    // <select debounce={200} /> ✓
  });
});
```

**Acceptance criteria:**
- [ ] `<form onChange={(values) => values.q}>` type-checks
- [ ] `<form onChange={(e: Event) => ...}>` is a type error
- [ ] `<input debounce={300}>` type-checks
- [ ] `<input debounce="fast">` is a type error
- [ ] `<textarea debounce={500}>` type-checks
- [ ] `<select debounce={200}>` type-checks
- [ ] `vtz run typecheck` passes for `packages/ui`

---

### Task 2: Theme component `debounce` prop forwarding

**Files:**
- `packages/ui-primitives/src/input/input-composed.tsx` (modified)
- `packages/ui-primitives/src/textarea/textarea-composed.tsx` (modified)

**What to implement:**

1. In `ComposedInputProps` interface (`packages/ui-primitives/src/input/input-composed.tsx`):
   - Add `debounce?: number;` to the interface
   - In `ComposedInputRoot`, destructure `debounce` from props
   - Forward it as `data-vertz-debounce={debounce}` on the native `<input>` element
   - Do NOT include `debounce` in the `...props` spread (since it's destructured out)

   ```tsx
   export interface ComposedInputProps {
     classes?: InputClasses;
     className?: string;
     /** @deprecated Use `className` instead. */
     class?: string;
     name?: string;
     placeholder?: string;
     type?: string;
     disabled?: boolean;
     value?: string;
     /** Debounce delay in ms for form-level onChange. */
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

2. Same pattern for `ComposedTextareaProps` (`packages/ui-primitives/src/textarea/textarea-composed.tsx`):
   - Add `debounce?: number;` to interface
   - Destructure and forward as `data-vertz-debounce={debounce}`

**Acceptance criteria:**
- [ ] `<Input debounce={300} name="q" />` renders `<input data-vertz-debounce="300" name="q" />`
- [ ] `<Textarea debounce={500} name="desc" />` renders `<textarea data-vertz-debounce="500" name="desc" />`
- [ ] `<Input name="q" />` (no debounce) does NOT render `data-vertz-debounce` attribute
- [ ] `vtz run typecheck` passes for `packages/ui-primitives`

---

### Task 3: Run cross-package typecheck

**Files:** (no changes — validation only)

**What to do:**
```bash
vtz run typecheck
```

**Acceptance criteria:**
- [ ] All packages typecheck cleanly
- [ ] No regressions in dependent packages
