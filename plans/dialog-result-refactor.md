# Design: Dialog Stack `open()` Returns Result Instead of Throwing

**Issue:** [#1301](https://github.com/vertz-dev/vertz/issues/1301)
**Status:** Reviewed — awaiting human sign-off
**Date:** 2026-03-14

## Problem

`DialogStack.open()` currently rejects with `DialogDismissedError` when the user dismisses a dialog (Escape key, `closeAll()`). This forces callers to use try/catch for a non-exceptional flow:

```tsx
const handleNewIssue = async () => {
  try {
    const created = await stack.open(CreateIssueDialog, { projectId });
    if (created) issues.refetch();
  } catch {
    // Dialog dismissed — no action needed
  }
};
```

This violates the Vertz convention of **errors as values**. Dismissal is an expected user action, not an exceptional error.

## API Surface

### `DialogResult<T>` — discriminated union

```ts
type DialogResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false };
```

TypeScript narrows `data` after checking `ok` — no optional access, no `undefined` surprise:

```ts
const result = await stack.open(ConfirmDialog, { message: 'Delete?' });
if (result.ok) {
  result.data; // T — narrowed, guaranteed present
}
if (!result.ok) {
  // @ts-expect-error — data does not exist on { ok: false }
  result.data;
}
```

### Return type change

```ts
// Before
open<TResult, TProps>(component, props): Promise<TResult>

// After
open<TResult, TProps>(component, props): Promise<DialogResult<TResult>>
```

### Usage — explicit close

```tsx
const result = await stack.open(ConfirmDialog, { message: 'Delete?' });
if (result.ok) {
  deleteItem(result.data); // data is T, narrowed by ok check
}
```

### Usage — dismissal

```tsx
const result = await stack.open(CreateIssueDialog, { projectId });
if (result.ok) {
  issues.refetch();
}
// No try/catch needed — dismissal resolves with { ok: false }
```

### Usage — void result

```tsx
const result = await stack.open(InfoDialog, {});
if (result.ok) {
  // result.data is void (undefined at runtime)
  // Callers of void dialogs typically don't access .data
}
```

For `DialogHandle<void>`, `close()` takes no arguments. The resolved result is `{ ok: true, data: undefined }` at runtime. `data: T` where `T = void` means `void`, which accepts `undefined`.

## Manifesto Alignment

- **"One Way to Do Things"** — Removes the error-vs-value ambiguity. Every `open()` call uses the same `if (result.ok)` pattern. No try/catch branching.
- **"My LLM nailed it on the first try"** — Result objects are a single, predictable pattern. An LLM won't forget try/catch because there isn't one.
- **"If it builds, it works"** — The discriminated union lets TypeScript narrow `data` access. Accessing `result.data` without checking `result.ok` is a compile-time error.
- **"Explicit over implicit"** — Dismissal is an explicit `{ ok: false }` value, not a hidden rejection path.

## Non-Goals

- Adding new dialog features (animations, focus trap, etc.)
- Changing `DialogHandle<TResult>` or how `dialog.close()` works from the dialog component's perspective
- Adding a `cancel()` method, `dismissed` field, or other new API surface — `ok: false` is the only dismissal state. If a second failure reason emerges (e.g., timeout), a `reason` discriminant can be added then.
- Deprecation period — pre-v1, we make the breaking change directly

## Unknowns

None identified. The change is mechanical — replace reject with resolve in `dismissEntry`, update the return type, update tests.

## Type Flow Map

```
DialogComponent<TResult, TProps>
  └─ dialog: DialogHandle<TResult>
       └─ close(result: TResult)
            └─ entry.resolve({ ok: true, data: result })
                 └─ Promise<DialogResult<TResult>>

dismissEntry
  └─ entry.resolve({ ok: false })
       └─ Promise<DialogResult<TResult>>
```

Generic `TResult` flows from the component type parameter → through `DialogHandle.close()` → into `DialogResult.data` on the success branch. No dead generics. The `ok: false` branch has no `data` field — `TResult` is not used.

## E2E Acceptance Test

```ts
describe('Feature: Dialog result pattern', () => {
  describe('Given a dialog that closes with a value', () => {
    describe('When dialog.close(value) is called', () => {
      it('Then open() resolves with { ok: true, data: value }', async () => {
        const stack = createDialogStack(container);
        function ConfirmDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
          const btn = document.createElement('button');
          btn.addEventListener('click', () => dialog.close(true));
          return btn;
        }
        const promise = stack.open(ConfirmDialog, {});
        container.querySelector('button')!.click();
        const result = await promise;
        expect(result).toEqual({ ok: true, data: true });
      });
    });
  });

  describe('Given an open dialog', () => {
    describe('When the user presses Escape', () => {
      it('Then open() resolves with { ok: false }', async () => {
        const stack = createDialogStack(container);
        function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
          return document.createElement('div');
        }
        const promise = stack.open(SimpleDialog, {});
        const wrapper = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
        wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const result = await promise;
        expect(result).toEqual({ ok: false });
      });
    });
  });

  describe('Given multiple open dialogs', () => {
    describe('When closeAll() is called', () => {
      it('Then all open() promises resolve with { ok: false }', async () => {
        const stack = createDialogStack(container);
        function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
          return document.createElement('div');
        }
        const r1 = stack.open(SimpleDialog, {});
        const r2 = stack.open(SimpleDialog, {});
        stack.closeAll();
        expect(await r1).toEqual({ ok: false });
        expect(await r2).toEqual({ ok: false });
      });
    });
  });
});
```

### Type-level tests (`.test-d.ts`)

```ts
import { expectTypeOf } from 'expect-type';

// Narrowing: ok branch has data
declare const result: DialogResult<string>;
if (result.ok) {
  expectTypeOf(result.data).toEqualTypeOf<string>();
}

// Narrowing: not-ok branch has no data
if (!result.ok) {
  // @ts-expect-error — data does not exist on { ok: false }
  result.data;
}

// Void result: data is void on ok branch
declare const voidResult: DialogResult<void>;
if (voidResult.ok) {
  expectTypeOf(voidResult.data).toEqualTypeOf<void>();
}

// open() return type matches DialogResult
declare const stack: DialogStack;
declare const component: DialogComponent<string, { msg: string }>;
expectTypeOf(stack.open(component, { msg: 'hi' })).toEqualTypeOf<Promise<DialogResult<string>>>();
```

## Implementation Plan

### Phase 1: Result type + core behavior change

**Scope:** Change `dialog-stack.ts` to return `DialogResult<T>` and update all tests.

**Changes:**
1. Add `DialogResult<T>` discriminated union type
2. Change `StackEntry.resolve` type from `(result: unknown) => void` to `(result: DialogResult<unknown>) => void`
3. Remove `StackEntry.reject` — dismissal now resolves. Promise constructor captures only `resolve`.
4. Update `closeEntry()` to resolve with `{ ok: true, data: result }`
5. Update `dismissEntry()` to resolve with `{ ok: false }` instead of rejecting
6. Update `DialogStack.open()` and `DialogStack.openWithScope()` return types to `Promise<DialogResult<TResult>>`
7. Remove `DialogDismissedError` class entirely — delete class, remove from exports in `dialog/index.ts` and `ui/src/index.ts`
8. Update `useDialogStack()` return type
9. Update all existing tests to use new result pattern (no more `.rejects.toBeInstanceOf`)
10. Add `.test-d.ts` file with narrowing tests as specified above

**Acceptance criteria:**
```typescript
describe('Feature: DialogResult return type', () => {
  describe('Given a dialog closed with dialog.close(value)', () => {
    describe('When the open() promise resolves', () => {
      it('Then result is { ok: true, data: value }', () => {});
    });
  });

  describe('Given a dialog dismissed via Escape', () => {
    describe('When the open() promise resolves', () => {
      it('Then result is { ok: false } with no data property', () => {});
    });
  });

  describe('Given a dialog dismissed via closeAll()', () => {
    describe('When the open() promise resolves', () => {
      it('Then result is { ok: false } with no data property', () => {});
    });
  });

  describe('Given a void-result dialog closed with dialog.close()', () => {
    describe('When the open() promise resolves', () => {
      it('Then result is { ok: true, data: undefined }', () => {});
    });
  });

  describe('Given the discriminated union type', () => {
    it('Then result.data is accessible only after checking result.ok', () => {});
    it('Then result.data is a type error without narrowing', () => {});
  });

  describe('Given DialogDismissedError was previously exported', () => {
    it('Then it is fully removed from source and exports', () => {});
  });
});
```

This is a single-phase change — the refactor is small and self-contained.

## Review Sign-offs

### DX (josh) — CHANGES REQUESTED → addressed
- Blocker: Changed to discriminated union with literal `ok: true` / `ok: false`
- Should-fix: Dropped `dismissed` field (redundant, violates "one way to do things")
- Should-fix: Added concrete `.test-d.ts` specification
- Nit: Added `readonly` modifiers to match `@vertz/errors` Result pattern
- Nit: Aligned on full removal of `DialogDismissedError`

### Product/Scope — APPROVED (with should-fix → addressed)
- Should-fix: Changed to discriminated union (addressed above)
- Nit: Dropped `dismissed` (addressed above)
- Nit: Aligned on removal vs deprecation (addressed above)

### Technical — CHANGES REQUESTED → addressed
- Blocker: Changed to discriminated union (addressed above)
- Blocker: Documented void result type flow (`data: T` where `T = void` accepts `undefined`)
- Should-fix: Dropped `dismissed` (addressed above)
- Should-fix: Aligned implementation plan step 7 — full removal, not deprecation
- Should-fix: Added concrete `.test-d.ts` acceptance criteria
