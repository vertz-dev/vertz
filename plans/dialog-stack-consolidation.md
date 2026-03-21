# Dialog Stack Consolidation

**Issue:** [#1647](https://github.com/vertz-dev/vertz/issues/1647)

## Summary

Consolidate dialog management around `DialogStack` as the **single dialog pattern**. Remove the trigger-based `<Dialog>` / `<AlertDialog>` compound component pattern. The stack automatically handles overlay, backdrop click, escape, ARIA, and focus trapping — dialog components become pure content. Context-aware sub-components (`Dialog.Cancel`, `Dialog.Close`, `Dialog.Title`) eliminate prop threading.

## Problem

Every stack-opened dialog in the linear clone repeats ~15 lines of boilerplate (overlay div, backdrop click, escape key, ARIA attributes) that the framework should handle. Meanwhile, the framework offers **two competing patterns** (trigger-based `<Dialog>` and imperative `DialogStack`), violating "one way to do things."

---

## API Surface

### Opening a dialog (unchanged)

```ts
const dialogs = useDialogStack();

// Open with promise-based result
const result = await dialogs.open(CreateIssueDialog, { projectId });
// result: DialogResult<Issue>
```

### Dialog component — before vs after

```tsx
// BEFORE — 50+ lines of boilerplate per dialog
function CreateIssueDialog({
  projectId,
  dialog,
}: {
  projectId: string;
  dialog: DialogHandle<Issue | false>;
}) {
  return (
    <div
      className={dialogStyles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) dialog.close(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') dialog.close(false); }}
      role="presentation"
    >
      <div className={dialogStyles.panel} role="dialog" aria-modal="true">
        <h3 className={dialogStyles.title}>Create Issue</h3>
        {/* form content */}
        <div className={dialogStyles.footer}>
          <Button onClick={() => dialog.close(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create</Button>
        </div>
      </div>
    </div>
  );
}

// AFTER — pure content, zero boilerplate
function CreateIssueDialog({
  projectId,
  dialog,
}: {
  projectId: string;
  dialog: DialogHandle<Issue | false>;
}) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Create Issue</Dialog.Title>
        <Dialog.Close />
      </Dialog.Header>
      {/* form content */}
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button onClick={() => dialog.close(issue)}>Create</Button>
      </Dialog.Footer>
    </>
  );
}
```

The component no longer renders overlay, handles escape, wires backdrop click, or sets ARIA attributes. The stack handles all of it.

### useDialog() hook — escape hatch for nested sub-components

The `dialog` prop is the **primary** way to access the handle. It provides type-safe inference (the stack infers `TResult` from the component's `DialogHandle<TResult>` prop type). `useDialog()` exists as an escape hatch for deeply nested sub-components that need the handle but don't have the prop threaded to them.

```ts
function useDialog<T = void>(): DialogHandle<T>;
```

```tsx
// Primary pattern — use the dialog prop (type-safe by construction)
function DeleteConfirmDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
  return (
    <>
      <Dialog.Title>Delete task?</Dialog.Title>
      <Dialog.Description>This action cannot be undone.</Dialog.Description>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button intent="danger" onClick={() => dialog.close(true)}>
          Delete
        </Button>
      </Dialog.Footer>
    </>
  );
}

// Escape hatch — useDialog() for deeply nested sub-components
// Note: the generic T is an unsafe cast. Developer must match T with the actual result type.
function NestedSubmitButton() {
  const dialog = useDialog<boolean>();
  return <Button onClick={() => dialog.close(true)}>Submit</Button>;
}
```

> **"One way to do things":** The `dialog` prop is the answer. `useDialog()` is the sub-component escape hatch, not an equal alternative. Docs should not present them side-by-side as equivalent patterns.

### Context-aware sub-components

```tsx
// Dialog.Cancel — reads DialogHandle from context, calls dismiss
<Dialog.Cancel>Cancel</Dialog.Cancel>
// Renders: <button data-part="cancel" onClick={() => handle.close()}>Cancel</button>

// Dialog.Close — X button, reads DialogHandle from context
<Dialog.Close />
// Renders: <button data-part="close" aria-label="Close" onClick={() => handle.close()}>×</button>

// Dialog.Title — registers ID for aria-labelledby on the stack's panel
<Dialog.Title>Create Issue</Dialog.Title>
// Renders: <h3 id="dlg-{dialogId}-title" data-part="title">Create Issue</h3>

// Dialog.Description — registers ID for aria-describedby on the stack's panel
<Dialog.Description>Fill in the details</Dialog.Description>
// Renders: <p id="dlg-{dialogId}-desc" data-part="description">Fill in the details</p>

// Dialog.Header — layout wrapper for title area
<Dialog.Header>
  <Dialog.Title>Title</Dialog.Title>
  <Dialog.Close />
</Dialog.Header>

// Dialog.Footer — layout wrapper for action buttons
<Dialog.Footer>
  <Dialog.Cancel>Cancel</Dialog.Cancel>
  <Button>Submit</Button>
</Dialog.Footer>

// Dialog.Body — scrollable content area (optional)
<Dialog.Body>
  {/* Long form content that scrolls */}
</Dialog.Body>
```

### Non-dismissible dialogs (replaces AlertDialog)

```tsx
// AlertDialog pattern — backdrop click and Escape are disabled
const confirmed = await dialogs.open(
  DeleteConfirmDialog,
  { taskName },
  { dismissible: false },
);
```

The third argument to `dialogs.open()` is an options object:

```ts
interface DialogOpenOptions {
  /** Whether the dialog can be dismissed by backdrop click or Escape. Default: true */
  dismissible?: boolean;
}
```

**Clarification:** `dismissible: false` only blocks **implicit** dismissal (backdrop click, Escape key). Explicit close actions (`dialog.close()`, `Dialog.Cancel`, `Dialog.Close`) always work regardless of the `dismissible` setting. This matches the AlertDialog mental model: the user must make an explicit choice, but Cancel is still an explicit choice.

### Built-in confirm helper

```tsx
const confirmed = await dialogs.confirm({
  title: 'Delete task?',
  description: 'This action cannot be undone.',
  confirm: 'Delete',
  cancel: 'Cancel',
  intent: 'danger', // styles the confirm button
  dismissible: false, // default — user must choose Cancel or Confirm
});
// confirmed: boolean
```

```ts
interface ConfirmOptions {
  title: string;
  description?: string;
  confirm?: string;  // default: 'Confirm'
  cancel?: string;   // default: 'Cancel'
  intent?: 'primary' | 'danger'; // default: 'primary'
  dismissible?: boolean; // default: false (most confirms should require explicit choice)
}
```

`dialogs.confirm()` is a convenience wrapper that opens a pre-built dialog component internally. The confirm component is built with imperative DOM inside `@vertz/ui` (same approach as `DialogStackProvider` — no circular dependency on `@vertz/ui-primitives`). It uses `data-part` attributes for theme styling.

### DialogStackProvider (unchanged)

```tsx
function App() {
  return (
    <DialogStackProvider>
      {/* app content */}
    </DialogStackProvider>
  );
}
```

---

## What the Stack Handles Automatically

When `dialogs.open()` is called, the stack renders this structure around the developer's component:

```
<dialog>  (native HTML — showModal() for focus trap + top layer)
  ::backdrop  (CSS pseudo-element — styled by theme)
  <div data-part="panel" role="dialog" aria-modal="true"
       aria-labelledby="dlg-{id}-title" aria-describedby="dlg-{id}-desc"
       data-dialog-depth="{n}" data-state="open">
    <DialogHandleContext.Provider>
      <DialogIdContext.Provider>
        <!-- Developer's component output -->
      </DialogIdContext.Provider>
    </DialogHandleContext.Provider>
  </div>
</dialog>
```

| Behavior | How |
|---|---|
| **Overlay/backdrop** | Native `<dialog>::backdrop` pseudo-element, styled by theme CSS |
| **Backdrop click** | `click` listener on `<dialog>` — check if click coordinates fall outside the panel's `getBoundingClientRect()` (more robust than `e.target` identity, which breaks if `<dialog>` has padding) |
| **Escape key** | Intercepts native `cancel` event — runs exit animation, then closes. Only topmost dialog responds. |
| **Focus trap** | Native `showModal()` provides this (top layer + inert background) |
| **Focus restoration** | Native `<dialog>` restores focus to previously focused element on close |
| **ARIA** | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (from Dialog.Title), `aria-describedby` (from Dialog.Description) |
| **Entry/exit animation** | `data-state="open"` → CSS entry animation. On close: `data-state="closed"` + `inert` + `pointer-events: none` → CSS exit animation → `dialog.close()` after `animationend` (200ms fallback). The `inert` attribute prevents interaction during exit animation, protecting focus restoration. |
| **Stacking** | `data-dialog-depth` for z-ordering. `data-state="background"` dims lower dialogs. |
| **Dismissible control** | `dismissible: false` disables implicit dismissal (backdrop click, Escape). Explicit close actions (`Dialog.Cancel`, `Dialog.Close`, `dialog.close()`) always work. |

### Why native `<dialog>`

Native `<dialog>` with `showModal()` gives us focus trapping, top-layer stacking, focus restoration, and `::backdrop` for free. Custom focus trapping is complex, error-prone, and unnecessary when the platform provides it. The ComposedDialog already uses this approach successfully.

---

## Context Architecture

The stack provides two contexts to the rendered component. Both are defined in `@vertz/ui` and imported by `@vertz/ui-primitives` sub-components. Both require manual `__stableId` per `context-stable-ids.md`.

### DialogHandleContext

```ts
const DialogHandleContext = createContext<DialogHandle<unknown>>(
  undefined,
  '@vertz/ui::DialogHandleContext',
);
```

Read by:
- `useDialog<T>()` hook (casts to `DialogHandle<T>`)
- `Dialog.Cancel` (calls `handle.close()` with no result → dismiss)
- `Dialog.Close` (calls `handle.close()` with no result → dismiss)

### DialogIdContext

```ts
const DialogIdContext = createContext<string>(
  undefined,
  '@vertz/ui::DialogIdContext',
);
```

Read by:
- `Dialog.Title` (sets `id="{dialogId}-title"`)
- `Dialog.Description` (sets `id="{dialogId}-desc"`)

### aria-labelledby / aria-describedby registration

The stack always sets `aria-labelledby="{dialogId}-title"` and `aria-describedby="{dialogId}-desc"` on the panel. If `Dialog.Title` or `Dialog.Description` is not rendered, the dangling ID reference is silently ignored per ARIA spec. In dev mode, the stack logs a `console.warn` if no element with the title ID is found in the panel after a microtask — prompting the developer to add `<Dialog.Title>`.

### Sub-component styling

All sub-components accept `className` (and `class`) props for custom styling, forwarded to the rendered element. Theme-provided classes are applied by default via `withStyles()`.

---

## What Gets Removed

| Component | Replacement |
|---|---|
| `Dialog()` root callable | Not needed — stack renders wrapper |
| `Dialog.Trigger` | Not needed — `dialogs.open()` opens dialogs |
| `Dialog.Content` | Not needed — stack renders panel |
| `AlertDialog()` root callable | `dialogs.open(..., { dismissible: false })` |
| `AlertDialog.Trigger` | Not needed — `dialogs.open()` |
| `AlertDialog.Content` | Not needed — stack renders panel |
| `AlertDialog.Cancel` | `Dialog.Cancel` (same behavior) |
| `AlertDialog.Action` | Regular `<Button>` with click handler |
| `ComposedDialog` (ui-primitives) | Stack-rendered wrapper |
| `ComposedAlertDialog` (ui-primitives) | Stack-rendered wrapper + `dismissible: false` |

## What Stays

| Component | Notes |
|---|---|
| `Dialog.Title` | Registers aria-labelledby via context |
| `Dialog.Description` | Registers aria-describedby via context |
| `Dialog.Header` | Layout wrapper |
| `Dialog.Footer` | Layout wrapper |
| `Dialog.Close` | X button, reads handle from context |
| `Dialog.Cancel` | Dismiss button, reads handle from context (NEW for Dialog) |
| `Dialog.Body` | Scrollable content area (NEW) |
| `DialogStackProvider` | Unchanged |
| `useDialogStack()` | Unchanged (+ `confirm()` method added) |
| `DialogHandle<T>` | Unchanged type |
| `DialogResult<T>` | Unchanged type |
| `dialogs.open()` | Unchanged signature (+ options param added) |

---

## Manifesto Alignment

### "One way to do things" (Principle 2)

This is the primary motivation. Today there are two dialog patterns (trigger-based and stack-based). This consolidates to one: the stack. One pattern means:
- LLMs don't guess which pattern to use
- Codebase has one dialog convention
- Documentation covers one approach

### "If it builds, it works" (Principle 1)

The `dialog` prop provides type-safe result inference:
```ts
dialog: DialogHandle<Issue | false> → TResult = Issue | false
```
`useDialog<T>()` preserves type safety via explicit generic.

### "AI agents are first-class users" (Principle 3)

An LLM writing a dialog component has exactly one pattern:
1. Use `dialogs.open(MyDialog, props)`
2. Dialog component returns sub-components (Title, Footer, Cancel)
3. No overlay/ARIA/escape boilerplate to remember

### What was rejected

- **Keep both patterns** — violates "one way to do things"
- **Dialog.Frame bridge component** — adds a new concept instead of fixing the right abstraction
- **Custom focus trap** — native `<dialog>` provides this; custom implementation is unnecessary complexity

---

## Non-Goals

- **Animation system redesign** — existing `data-state` CSS approach continues
- **Non-modal dialogs** — sheets, drawers, popovers are different primitives
- **Custom overlay rendering** — theme handles styling via `::backdrop` CSS
- **Multi-window support** — dialogs are single-window only
- **Nested DialogStackProviders** — one provider per app, at root. Library-level scoped stacks are a future consideration if demand arises.
- **SSR-opened dialogs** — dialogs are client-side only. No dialogs are open during SSR; `showModal()` is only called after hydration. If `dialogs.open()` is called during SSR component init, it is a no-op or throws.

---

## Unknowns

1. **`@vertz/ui` build pipeline does not include the Vertz compiler.** The DialogStack is in `@vertz/ui` (plain bunup, no compiler plugin). New DOM structure will use the same imperative DOM approach (`document.createElement`, `__element()`, `__insert()`) that the stack already uses. Sub-components in `@vertz/ui-primitives` go through the compiler normally.

   **Resolution:** Confirmed — the stack creates native DOM elements imperatively. Sub-components are compiled JSX in ui-primitives. This is the existing pattern and works.

2. **Native `<dialog>` stacking with `showModal()`.** Multiple `showModal()` calls create multiple top-layer entries. Later calls are on top. Browser support is excellent (baseline 2022). The existing `ComposedDialog` already uses this pattern.

   **Resolution:** Confirmed working — this is the same approach the composed dialog uses.

3. **`showModal()` limitations in happy-dom.** The `@vertz/ui` test suite uses happy-dom. `showModal()` sets the `open` attribute but does NOT implement top-layer semantics, real focus trapping, or automatic `cancel` event dispatch on Escape.

   **Resolution:** Use the same test strategy as `dialog-composed.test.ts`: manually dispatch `cancel` events, test `data-state` transitions, mock `showModal()`/`close()` behavior. Real focus trap and top-layer behavior are verified in Playwright integration tests (`.local.ts` files). This is the existing pattern and works.

4. **`openWithScope()` third-parameter conflict.** The internal `open()` currently passes `capturedScope` as a third parameter. Adding `options` requires restructuring.

   **Resolution:** Restructure internal `open()` to take a single options object: `{ scope?: ContextScope | null; dismissible?: boolean }`. The public `open()` signature adds the optional third param and passes it through with the scope merged.

---

## POC Results

No formal POC needed. The `ComposedDialog` in `ui-primitives` already demonstrates:
- Native `<dialog>` with `showModal()` for focus trap and backdrop
- `::backdrop` pseudo-element styling via theme CSS
- `cancel` event interception for animated escape handling
- `data-state` based entry/exit animations

The `DialogStack` already demonstrates:
- Imperative dialog management with promise-based results
- Stacking with `data-dialog-depth`
- Context scope capture for provider access
- Escape key handling for topmost dialog only

This design combines both proven approaches.

---

## Type Flow Map

### `dialogs.open()` → component → result

```
dialogs.open(CreateIssueDialog, { projectId })
         │
         ├─ TProps = { projectId: string }
         │  (inferred from component params minus `dialog`)
         │
         ├─ TResult = Issue | false
         │  (inferred from DialogHandle<Issue | false> in component params)
         │
         ├─ Component receives: { projectId: string; dialog: DialogHandle<Issue | false> }
         │                                                    │
         │                                                    └─ dialog.close(issue) ← must be Issue | false
         │
         └─ Returns: Promise<DialogResult<Issue | false>>
                     │
                     ├─ { ok: true; data: Issue | false }
                     └─ { ok: false }
```

### `useDialog<T>()` → typed handle

```
useDialog<boolean>()
         │
         ├─ Reads DialogHandleContext → DialogHandle<unknown>
         │
         └─ Returns DialogHandle<boolean> (cast)
            │
            └─ dialog.close(true) ← must be boolean
```

Developer is responsible for matching `T` with the actual result type.

### `Dialog.Cancel` → dismiss (no type param needed)

```
<Dialog.Cancel>Cancel</Dialog.Cancel>
         │
         ├─ Reads DialogHandleContext → DialogHandle<unknown>
         │
         └─ onClick → handle.close() (no args → dismiss → { ok: false })
```

### `Dialog.Title` → aria-labelledby

```
<Dialog.Title>Create Issue</Dialog.Title>
         │
         ├─ Reads DialogIdContext → "dlg-1"
         │
         └─ Renders <h3 id="dlg-1-title">
                          │
                          └─ Stack panel: aria-labelledby="dlg-1-title"
```

### `dialogs.confirm()` → boolean

```
dialogs.confirm({ title: 'Delete?', intent: 'danger' })
         │
         ├─ Opens internal confirm component with dismissible: false
         │
         ├─ Confirm button click → dialog.close(true) → unwrap → true
         │
         ├─ Cancel button click → dialog.close(false) → unwrap → false
         │
         └─ Returns: Promise<boolean> (unwrapped from DialogResult)
```

### `.test-d.ts` requirements

```ts
// dialogs.open() infers TResult from component
const result = await dialogs.open(BoolDialog, {});
expectTypeOf(result).toEqualTypeOf<DialogResult<boolean>>();

// dialogs.open() infers TProps (minus dialog)
// @ts-expect-error — missing required prop
await dialogs.open(BoolDialog, {});

// useDialog<T>() returns typed handle
const handle = useDialog<string>();
handle.close('ok'); // valid
// @ts-expect-error — wrong type
handle.close(42);

// Dialog.Cancel requires no type param — dismiss only
// (no type flow test needed — it's void)

// options param is optional
await dialogs.open(BoolDialog, {}, { dismissible: false }); // valid
await dialogs.open(BoolDialog, {}); // also valid

// confirm returns boolean
const ok = await dialogs.confirm({ title: 'Sure?' });
expectTypeOf(ok).toEqualTypeOf<boolean>();
```

---

## E2E Acceptance Test

### Developer perspective — stack-opened dialog with zero boilerplate

```tsx
// 1. Developer defines a dialog component — pure content, no overlay/ARIA/escape
function GreetingDialog({
  name,
  dialog,
}: {
  name: string;
  dialog: DialogHandle<string>;
}) {
  let customGreeting = '';

  return (
    <>
      <Dialog.Title>Greet {name}</Dialog.Title>
      <Dialog.Body>
        <Input
          placeholder="Custom greeting"
          onInput={(e) => { customGreeting = e.currentTarget.value; }}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Skip</Dialog.Cancel>
        <Button onClick={() => dialog.close(customGreeting || `Hello, ${name}!`)}>
          Send
        </Button>
      </Dialog.Footer>
    </>
  );
}

// 2. Developer opens via stack — overlay, ARIA, focus trap all automatic
function AppContent() {
  const dialogs = useDialogStack();

  const handleGreet = async () => {
    const result = await dialogs.open(GreetingDialog, { name: 'Alice' });
    if (result.ok) {
      console.log(result.data); // "Hello, Alice!" or custom
    }
  };

  return <Button onClick={handleGreet}>Greet</Button>;
}

function App() {
  return (
    <DialogStackProvider>
      <AppContent />
    </DialogStackProvider>
  );
}

// 3. Expected DOM when dialog is open:
// <dialog open data-state="open">
//   ::backdrop (styled by theme)
//   <div data-part="panel" role="dialog" aria-modal="true"
//        aria-labelledby="dlg-0-title">
//     <h3 id="dlg-0-title" data-part="title">Greet Alice</h3>
//     <div data-part="body">
//       <input placeholder="Custom greeting" />
//     </div>
//     <div data-part="footer">
//       <button data-part="cancel">Skip</button>
//       <button>Send</button>
//     </div>
//   </div>
// </dialog>

// 4. Behaviors — all handled by stack:
// - Clicking ::backdrop → result = { ok: false }
// - Pressing Escape → result = { ok: false }
// - Focus trapped within dialog
// - Focus returns to "Greet" button after close

// 5. Non-dismissible variant:
const result = await dialogs.open(CriticalDialog, props, { dismissible: false });
// - Backdrop click does nothing (implicit dismiss blocked)
// - Escape does nothing (implicit dismiss blocked)
// - Explicit actions always work: dialog.close(), Dialog.Cancel, Dialog.Close

// 6. Built-in confirm:
const confirmed = await dialogs.confirm({
  title: 'Delete task?',
  description: 'This action cannot be undone.',
  confirm: 'Delete',
  cancel: 'Cancel',
  intent: 'danger',
});
// confirmed: boolean

// 7. Invalid usage:
// @ts-expect-error — useDialog() outside of dialog stack throws
useDialog();
```

---

## Implementation Plan

### Phase 1: Stack renders overlay + panel with native `<dialog>`

Modify `DialogStack` in `@vertz/ui` to render native `<dialog>` elements with `showModal()`, replacing the current bare wrapper `<div>`.

**Changes:**
- Stack creates `<dialog>` element instead of `<div>` wrapper
- Calls `showModal()` on open for focus trap + top layer
- Adds panel `<div>` inside with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- Intercepts `cancel` event for animated escape handling
- Adds backdrop click detection (`e.target === dialog`)
- Adds `dismissible` option (third param to `open()`)
- Provides `DialogHandleContext` and `DialogIdContext` via context
- Adds `useDialog<T>()` hook

**Acceptance criteria:**
```ts
describe('Given a dialog opened via dialogs.open()', () => {
  describe('When rendered', () => {
    it('Then wraps content in native <dialog> with showModal()', () => {});
    it('Then sets role="dialog" and aria-modal="true" on panel', () => {});
    it('Then sets aria-labelledby and aria-describedby with dialog ID', () => {});
  });

  describe('When clicking the backdrop', () => {
    it('Then dismisses the dialog with { ok: false }', () => {});
  });

  describe('When pressing Escape', () => {
    it('Then dismisses the topmost dialog only', () => {});
  });

  describe('When dismissible is false', () => {
    it('Then backdrop click does not close', () => {});
    it('Then Escape does not close', () => {});
  });

  describe('When useDialog() is called inside the dialog', () => {
    it('Then returns the DialogHandle from context', () => {});
  });
});
```

### Phase 2: Context-aware sub-components

Update `Dialog` sub-components in `@vertz/ui-primitives` to read from the stack-provided contexts.

**Changes:**
- `Dialog.Title` reads `DialogIdContext` → sets `id="{dialogId}-title"`
- `Dialog.Description` reads `DialogIdContext` → sets `id="{dialogId}-desc"`
- `Dialog.Close` reads `DialogHandleContext` → calls `handle.close()` on click
- Add `Dialog.Cancel` — reads `DialogHandleContext` → calls `handle.close()` on click
- Add `Dialog.Body` — layout wrapper with `data-part="body"`
- Update `createCompoundProxy` for Dialog: remove Trigger/Content, add Cancel/Body
- Update theme-shadcn styles for new sub-components

**Acceptance criteria:**
```ts
describe('Given Dialog.Title inside a stack-opened dialog', () => {
  it('Then renders with id derived from DialogIdContext', () => {});
});

describe('Given Dialog.Cancel inside a stack-opened dialog', () => {
  describe('When clicked', () => {
    it('Then calls handle.close() with no result', () => {});
    it('Then dialog resolves with { ok: false }', () => {});
  });
});

describe('Given Dialog.Close inside a stack-opened dialog', () => {
  describe('When clicked', () => {
    it('Then calls handle.close() with no result', () => {});
  });
});
```

### Phase 3: Remove trigger-based pattern + add confirm helper

Remove `Dialog.Trigger`, `Dialog.Content`, `AlertDialog` compound component. Add `dialogs.confirm()`.

**Changes:**
- Remove `ComposedDialog` from ui-primitives (or strip to sub-components only)
- Remove `ComposedAlertDialog` from ui-primitives
- Remove factory `Dialog.Root` and `AlertDialog.Root` from ui-primitives
- Remove `AlertDialog` export from `@vertz/ui/components`
- Add `dialogs.confirm()` method on the stack
- Update `Dialog` compound proxy: sub-components only (Title, Description, Header, Footer, Body, Close, Cancel)
- Clean up theme-shadcn: remove trigger/content styles, keep sub-component + overlay/panel styles

**Acceptance criteria:**
```ts
describe('Given dialogs.confirm()', () => {
  describe('When user clicks confirm button', () => {
    it('Then returns true', () => {});
  });

  describe('When user clicks cancel or presses Escape', () => {
    it('Then returns false', () => {});
  });

  describe('When intent is "danger"', () => {
    it('Then confirm button uses danger styling', () => {});
  });
});
```

### Phase 4: Update examples and component docs

Simplify all dialog components across examples and documentation sites.

**Changes:**
- `examples/linear/` — simplify all 4 dialog components (remove overlay/escape/ARIA boilerplate, use `Dialog.Cancel`/`Dialog.Title`/`Dialog.Footer`)
- `examples/component-catalog/` — rewrite dialog demo to use stack pattern with inline `DialogStackProvider` + button that calls `dialogs.open()`
- `examples/task-manager/` — full rewrite: add `DialogStackProvider` to app root, replace hand-rolled `ConfirmDialog` with `dialogs.confirm()` (ideal showcase for the helper)
- `sites/component-docs/` — remove AlertDialog page, rewrite Dialog page to show stack pattern, consolidate DialogStack page as the primary Dialog reference
- Verify all examples and sites build and run

### Phase 5: Documentation

- Update `packages/docs/` with new dialog pattern
- Remove trigger-based dialog docs
- Add stack-based dialog guide with sub-components
- Document `useDialog()` as escape hatch (not primary pattern)
- Document `Dialog.Cancel`, `dialogs.confirm()`
- Add migration note (trigger-based → stack-based)

---

## Test Strategy

### Unit tests (happy-dom) — Phases 1-3

Happy-dom's `<dialog>` support is shallow: `showModal()` sets `open` but doesn't implement top-layer, focus trapping, or automatic `cancel` events. This is the same constraint `dialog-composed.test.ts` already handles. The test strategy is:

- **`showModal()`/`close()`**: Call directly; verify `open` attribute and `data-state` transitions.
- **Escape key**: Manually dispatch `cancel` event on the `<dialog>` element (not `keydown` on document).
- **Backdrop click**: Dispatch `click` event on the `<dialog>` element with coordinates outside the panel rect.
- **ARIA**: Assert attributes on the panel div (`role`, `aria-modal`, `aria-labelledby`, `aria-describedby`).
- **Context**: Assert `useDialog()` returns the handle, `Dialog.Cancel` calls `close()`.
- **Focus trapping**: NOT tested in unit tests — happy-dom doesn't implement it.

### Integration tests (Playwright `.local.ts`) — Phase 4

Real browser tests verify behaviors that happy-dom can't:

- **Focus trapping**: Tab key cycles within dialog, doesn't escape.
- **Focus restoration**: After close, focus returns to the element that triggered the dialog.
- **`::backdrop`**: Visible, styled correctly.
- **Stacked dialogs**: Second dialog is on top, first is dimmed.
- **Animation**: Entry/exit animations play correctly.
- **`inert` during exit**: Can't interact with closing dialog.

---

## Review Findings Addressed

| # | Source | Severity | Finding | Resolution |
|---|--------|----------|---------|------------|
| 1 | DX | should-fix | `dialog` prop vs `useDialog()` duality | Clarified: prop is primary, hook is escape hatch for sub-components |
| 2 | DX+Product | should-fix | `Dialog.Cancel` in `dismissible: false` | Clarified: `dismissible` only blocks implicit dismiss, explicit actions always work |
| 3 | DX | should-fix | `confirm()` missing `dismissible` option | Added with default `false` |
| 4 | DX | nit | `Dialog.Cancel` vs `Dialog.Close` naming | Cancel = text button (footer), Close = icon button (header). Documented. |
| 5 | DX | nit | `className` on sub-components | Confirmed all accept `className` |
| 6 | DX | nit | E2E example provider placement | Fixed — `AppContent` inside `DialogStackProvider` |
| 7 | DX | should-fix | Component catalog demo strategy | Addressed in Phase 4 |
| 8 | Product | should-fix | Task-manager uses neither pattern | Added full rewrite details in Phase 4 |
| 9 | Product | should-fix | `sites/component-docs/` missing | Added to Phase 4 |
| 10 | Product | nit | Nested providers non-goal | Added future consideration note |
| 11 | Technical | blocker | `showModal()` in happy-dom | Added Test Strategy section with explicit approach |
| 12 | Technical | should-fix | Backdrop click fragility | Changed to `getBoundingClientRect()` approach |
| 13 | Technical | should-fix | Focus restoration during animation | Added `inert` + `pointer-events: none` during exit |
| 14 | Technical | should-fix | Context stable IDs | Added explicit IDs in Context Architecture |
| 15 | Technical | should-fix | `openWithScope` signature conflict | Added resolution in Unknowns |
| 16 | Technical | should-fix | `aria-labelledby` dangles | Added dev-mode warning approach |
| 17 | Technical | nit | `useDialog<T>()` type safety caveat | Noted as unsafe cast in API Surface |
| 18 | Technical | nit | `confirm()` component location | Documented imperative DOM approach |
| 19 | Technical | nit | SSR behavior | Added to Non-Goals |
