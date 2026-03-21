# DialogStack Auto Container

**Issue:** [#1643](https://github.com/vertz-dev/vertz/issues/1643)

## Problem

Every app using `createDialogStack()` must write a 6-line SSR/hydration workaround to create the container element:

```tsx
// Current — manual, error-prone, violates "one way to do things"
const dialogContainer = isBrowser()
  ? ((document.querySelector('[data-dialog-container]') as HTMLDivElement) ??
      document.createElement('div'))
  : document.createElement('div');
dialogContainer.setAttribute('data-dialog-container', '');
const dialogStack = createDialogStack(dialogContainer);

return (
  <DialogStackContext.Provider value={dialogStack}>
    <>
      <RouterView ... />
      {dialogContainer}
    </>
  </DialogStackContext.Provider>
);
```

This boilerplate exists because `document.createElement()` during hydration creates a **detached** element — the Vertz hydration system (`__append` is a no-op during hydration) doesn't adopt it. The workaround queries the DOM for the existing SSR node to get the correct element reference.

An LLM will not get this right on the first prompt.

## API Surface

### Proposed: `DialogStackProvider` component

```tsx
import { DialogStackProvider, RouterView } from '@vertz/ui';

export function App() {
  return (
    <DialogStackProvider>
      <RouterView router={appRouter} fallback={() => <div>Not found</div>} />
    </DialogStackProvider>
  );
}
```

The `DialogStackProvider`:
1. Creates a `<div data-dialog-container="">` via JSX (`__element`) — hydration-safe
2. Calls `createDialogStack(container)` with that element
3. Wraps children in `DialogStackContext.Provider`
4. Renders the container div after children (portals append here)

Consumer code uses `useDialogStack()` exactly as before — no change.

### Implementation sketch

`@vertz/ui` is pre-compiler runtime code (`.ts` files, no JSX compilation). The implementation uses the imperative DOM API (`__element`, `__insert`) — the same pattern as all other components in `packages/ui/src/`.

```ts
// packages/ui/src/dialog/dialog-stack.ts

export function DialogStackProvider({ children }: { children?: unknown }): HTMLElement {
  // __element is hydration-safe: claims existing SSR node during hydration,
  // creates new element during SSR/CSR.
  const container = __element('div', { 'data-dialog-container': '' }) as HTMLDivElement;
  const stack = createDialogStack(container);

  // Use Provider's JSX pattern (single-arg object with children thunk).
  // The children thunk creates a DocumentFragment with app content + container.
  return DialogStackContext.Provider({
    value: stack,
    children: () => {
      const frag = document.createDocumentFragment();
      // __insert resolves thunks, arrays, nodes, and primitives
      __insert(frag, children);
      // Container renders after children — dialogs appear at end of subtree
      frag.appendChild(container);
      return frag;
    },
  });
}
```

This works because `__element` returns a real DOM element synchronously:
- **SSR:** Creates a DOM-shim element → serialized into HTML
- **Hydration:** Claims the existing `<div data-dialog-container="">` from SSR output → same element reference
- **CSR:** Creates a new div → appended normally

The container element is the same object in memory that `createDialogStack` receives, so dialog wrappers are always appended to the correct, in-DOM node.

**Note:** `Provider({ value, children })` returns `HTMLElement` but a `DocumentFragment` is technically not an `HTMLElement`. This is a pre-existing type gap in the Provider API (fragments work correctly at runtime, see `context.test.ts`). Not addressed here.

### `createDialogStack()` stays as-is

The low-level `createDialogStack(container)` API is unchanged — it remains available for advanced use cases (custom container placement, testing, etc.). `DialogStackProvider` is the recommended way.

## Manifesto Alignment

- **One way to do things (Principle 2):** Today there's exactly one way, but it's a 6-line boilerplate trap. `DialogStackProvider` makes the one way obvious and correct.
- **AI agents are first-class users (Principle 3):** An LLM can use `<DialogStackProvider>` correctly on the first prompt. The manual `isBrowser() + querySelector` pattern is a known failure mode.
- **If it builds, it works (Principle 1):** The Provider component ensures the container is always hydration-safe by construction. The manual approach relies on the developer knowing the hydration rules.

## Non-Goals

- **Changing `createDialogStack()` API** — the low-level function keeps its `container` parameter.
- **Automatic dialog styling** — the Provider handles container management only, not dialog appearance.
- **Global/automatic Provider** — the developer still explicitly places `<DialogStackProvider>` in their component tree. No magic injection.

## Unknowns

None identified. The implementation is a thin wrapper over existing, well-tested primitives (`createDialogStack`, `DialogStackContext.Provider`, JSX element creation).

## Type Flow Map

No new generics introduced. `DialogStackProvider` accepts `{ children?: unknown }` and renders JSX. All existing generic flows (`DialogHandle<TResult>`, `DialogComponent<TResult, TProps>`) remain unchanged.

```
DialogStackProvider({ children })
  └─ createDialogStack(container: HTMLElement) → DialogStack
       └─ DialogStackContext.Provider(stack) → children can useDialogStack()
            └─ useDialogStack() → DialogStack (unchanged)
                 └─ stack.open<TResult, TProps>(component, props) → Promise<DialogResult<TResult>>
```

## E2E Acceptance Test

```tsx
// Developer perspective — this is all you write:
import { DialogStackProvider, useDialogStack } from '@vertz/ui';

function App() {
  return (
    <DialogStackProvider>
      <MyPage />
    </DialogStackProvider>
  );
}

function MyPage() {
  const dialogs = useDialogStack();

  async function handleDelete() {
    const result = await dialogs.open(ConfirmDialog, { message: 'Delete?' });
    if (result.ok) { /* delete */ }
  }

  return <button onClick={handleDelete}>Delete</button>;
}

function ConfirmDialog({ message, dialog }: { message: string; dialog: DialogHandle<boolean> }) {
  return (
    <div>
      <p>{message}</p>
      <button onClick={() => dialog.close(true)}>Yes</button>
      <button onClick={() => dialog.close(false)}>No</button>
    </div>
  );
}
```

```tsx
// Invalid usage — @ts-expect-error
// @ts-expect-error — DialogStackProvider does not accept arbitrary props
<DialogStackProvider theme="dark" />;
```

## Implementation Plan

### Phase 1: `DialogStackProvider` component + tests

**Scope:** Add `DialogStackProvider` to `packages/ui/src/dialog/dialog-stack.ts`, export it, write unit tests.

**Acceptance Criteria:**

```typescript
describe('Feature: DialogStackProvider', () => {
  describe('Given a DialogStackProvider wrapping children', () => {
    describe('When useDialogStack() is called inside children', () => {
      it('Then returns a working DialogStack', () => {});
    });

    describe('When a dialog is opened via stack.open()', () => {
      it('Then the dialog renders inside the container div', () => {});
      it('Then the container div has data-dialog-container attribute', () => {});
    });

    describe('When a dialog is closed', () => {
      it('Then the dialog is removed and promise resolves', () => {});
    });
  });

  describe('Given DialogStackProvider is NOT in the tree', () => {
    describe('When useDialogStack() is called', () => {
      it('Then throws "must be called within DialogStackProvider"', () => {});
    });
  });
});
```

- Quality gates pass (test + typecheck + lint)
- `DialogStackProvider` exported from `@vertz/ui`

### Phase 2: Update Linear clone to use `DialogStackProvider`

**Scope:** Replace manual container setup in `examples/linear/src/app.tsx` with `<DialogStackProvider>`.

**Acceptance Criteria:**

- Linear clone `App` component uses `<DialogStackProvider>` — no `isBrowser()`, no `querySelector`, no manual container
- Dialog functionality unchanged (create issue, edit issue, create project all work)
- Existing dialog tests still pass

### Phase 3: Update documentation

**Scope:** Update docs to recommend `DialogStackProvider` as the standard approach.

**Acceptance Criteria:**

- Dialog stack docs show `DialogStackProvider` as the primary API
- `createDialogStack()` documented as low-level/advanced
