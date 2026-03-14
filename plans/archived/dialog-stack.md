# Design Doc: Dialog Stack — Imperative, Promise-Based Dialog Management

**Status:** Draft
**Author:** ken
**Feature:** Dialog Stack
**Reviewers:**
- [x] **DX review (Josh)** — APPROVED. Feedback addressed: TResult type safety (prop-based handle), closeAll() (rejects with error), Escape/backdrop (dismissal section added).
- [ ] **Scope review** — Pending
- [x] **Technical feasibility (Nora)** — REQUEST CHANGES → addressed: context capture moved to `useDialogStack()` time, TResult cast eliminated via prop-based handle.

---

## 1. API Surface

### 1.1 DialogStack — creating and using the stack

```tsx
// packages/ui/src/dialog/dialog-stack.ts

import { createContext, useContext } from '../component/context';

export const DialogStackContext = createContext<DialogStack>();

export function useDialogStack(): DialogStack {
  const stack = useContext(DialogStackContext);
  if (!stack) {
    throw new Error('useDialogStack() must be called within DialogStackProvider');
  }
  return stack;
}
```

### 1.2 DialogStackProvider — centralized render point

One mount point in the app shell. All dialogs render here.

```tsx
// App shell — one DialogStackProvider at the root
import { DialogStackProvider, RouterContext, RouterView } from '@vertz/ui';

export function App() {
  return (
    <DialogStackProvider>
      <RouterContext.Provider value={appRouter}>
        <RouterView router={appRouter} />
      </RouterContext.Provider>
    </DialogStackProvider>
  );
}
```

`DialogStackProvider` renders a container element (portal target) and provides the `DialogStack` instance via context. Dialogs render as children of this container, overlaying the app content.

### 1.3 Opening a dialog — imperative, promise-based

```tsx
import { useDialogStack } from '@vertz/ui';

function ProjectCard({ project }: ProjectCardProps) {
  const dialogs = useDialogStack();

  async function handleDelete() {
    // Opens ConfirmDeleteDialog, awaits user response
    const confirmed = await dialogs.open(ConfirmDeleteDialog, {
      projectName: project.name,
    });

    if (confirmed) {
      await deleteProject(project.id);
    }
  }

  return (
    <div>
      <span>{project.name}</span>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
}
```

### 1.4 Defining a dialog component

Dialog components receive their props plus a `dialog` handle as a prop for closing with a typed result.

```tsx
interface ConfirmDeleteProps {
  projectName: string;
}

function ConfirmDeleteDialog({ projectName, dialog }: ConfirmDeleteProps & { dialog: DialogHandle<boolean> }) {
  return (
    <div role="alertdialog" aria-modal="true">
      <h2>Delete {projectName}?</h2>
      <p>This action cannot be undone.</p>
      <button onClick={() => dialog.close(false)}>Cancel</button>
      <button onClick={() => dialog.close(true)}>Delete</button>
    </div>
  );
}
```

Note: The `dialog` prop is injected by the stack — you don't pass it yourself when calling `open()`. The component type `DialogComponent<boolean, ConfirmDeleteProps>` handles this automatically.

### 1.5 The dialog handle — prop-based, fully typed

The dialog handle is passed as a `dialog` prop — not via context. This ensures TResult flows naturally from `open()` through the component signature to `close()` with zero casts.

```tsx
export interface DialogHandle<TResult> {
  /** Close this dialog and resolve the open() promise with the given result. */
  close(result: TResult): void;
  /** Close without a result. Only available when TResult allows void. */
  close(...args: void extends TResult ? [] : [result: TResult]): void;
}

/** A dialog component receives its props plus the typed dialog handle. */
export type DialogComponent<TResult, TProps = Record<string, never>> = (
  props: TProps & { dialog: DialogHandle<TResult> },
) => Node;
```

**Why prop-based instead of `useDialog<TResult>()`:** The original design used `useDialog<TResult>()` via context, which required an `as DialogHandle<TResult>` cast internally — there was no compile-time link between the opener's TResult and the dialog's TResult. With the handle as a prop, TResult is inferred from the component signature and flows through `open()` → component → `dialog.close()` without any casts.

### 1.6 Stack behavior — push/pop

Opening a dialog while another is open pushes onto the stack. Closing pops and reveals the previous.

```tsx
async function handleComplexFlow() {
  const dialogs = useDialogStack();

  // Opens DialogA
  const choice = await dialogs.open(ChooseActionDialog, { items });

  if (choice === 'transfer') {
    // While still conceptually "inside" the flow,
    // DialogA is already closed (its await resolved).
    // Opening DialogB is a fresh stack entry.
    const recipient = await dialogs.open(SelectRecipientDialog, { team });
    await transferItems(items, recipient);
  }
}
```

For nested dialogs (dialog opens another dialog from within):

```tsx
function ChooseActionDialog({ items, dialog }: ChooseActionProps & { dialog: DialogHandle<string> }) {
  const dialogs = useDialogStack();

  async function handleTransferWithConfirm() {
    // Opens ConfirmDialog ON TOP of ChooseActionDialog
    // ChooseActionDialog is hidden (not destroyed) while ConfirmDialog is visible
    const confirmed = await dialogs.open(ConfirmDialog, {
      message: `Transfer ${items.length} items?`,
    });

    if (confirmed) {
      dialog.close('transfer');
    }
    // If not confirmed, ChooseActionDialog is revealed again (popped back)
  }

  return (
    <div>
      <button onClick={() => dialog.close('delete')}>Delete</button>
      <button onClick={handleTransferWithConfirm}>Transfer...</button>
    </div>
  );
}
```

**Stack transitions:**
1. `dialogs.open(ChooseAction)` → stack: `[ChooseAction]` — ChooseAction visible
2. User clicks "Transfer..." → `dialogs.open(Confirm)` → stack: `[ChooseAction, Confirm]` — ChooseAction hidden, Confirm visible
3. User clicks "Cancel" on Confirm → `dialog.close(false)` → stack: `[ChooseAction]` — Confirm removed, ChooseAction revealed
4. User clicks "Delete" → `dialog.close('delete')` → stack: `[]` — ChooseAction removed

### 1.7 DialogStack interface

```tsx
export interface DialogStack {
  /**
   * Open a dialog component with props. Returns a promise that resolves
   * when the dialog closes, with the value passed to dialog.close().
   */
  open<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
  ): Promise<TResult>;

  /**
   * Open a dialog component that takes no props.
   */
  open<TResult>(
    component: DialogComponent<TResult, Record<string, never>>,
  ): Promise<TResult>;

  /** Number of dialogs currently in the stack. */
  readonly size: number;

  /**
   * Close all dialogs in the stack.
   * Each dialog's promise rejects with a DialogDismissedError.
   */
  closeAll(): void;
}
```

### 1.8 Dismissal behavior — Escape, backdrop, closeAll

Dialogs can be dismissed (closed without an explicit result) via:
- **Escape key** — closes the topmost dialog
- **Backdrop click** — clicks on the overlay close the topmost dialog
- **`closeAll()`** — closes every dialog in the stack

All three are **dismissals**, not explicit closes. The distinction matters for type safety.

**Dismissals reject the promise** with a `DialogDismissedError`:

```tsx
export class DialogDismissedError extends Error {
  constructor() {
    super('Dialog was dismissed');
    this.name = 'DialogDismissedError';
  }
}
```

**Consumer pattern:**

```tsx
try {
  const confirmed = await dialogs.open(ConfirmDialog, { name: project.name });
  if (confirmed) await deleteProject(project.id);
} catch (e) {
  if (e instanceof DialogDismissedError) {
    // User hit Escape, clicked backdrop, or closeAll() was called.
    // No action needed — treat as "cancel".
  } else {
    throw e; // re-throw unexpected errors
  }
}
```

**Why reject instead of resolving with `undefined`?**

Resolving with `undefined` violates `Promise<TResult>` when `TResult` is `boolean` or another non-optional type. Rejection is type-safe — the consumer explicitly handles it or ignores it. `DialogDismissedError` is a concrete class, not a generic Error, so `instanceof` checks are reliable.

**Opt-out per dialog:** Dialogs that should NOT dismiss on Escape/backdrop (e.g., AlertDialog-style) use `dismissible: false`:

```tsx
const confirmed = await dialogs.open(ConfirmDialog, { name }, { dismissible: false });
```

When `dismissible: false`, Escape and backdrop clicks are ignored. `closeAll()` still works (it's an explicit programmatic action, not user dismissal).

### 1.9 Animation support — open and close transitions

Dialogs must animate both on open and on close. On close, the dialog is NOT removed from the DOM until the exit animation completes.

**How it works:** The stack uses the same `setHiddenAnimated()` / `onAnimationsComplete()` pattern that the existing primitives (Dialog, Sheet, AlertDialog) already use.

```
Open:
  1. Append dialog node to container
  2. Set data-state="open" — triggers CSS enter animation
  3. Focus trap activates

Close:
  1. Set data-state="closed" — triggers CSS exit animation
  2. onAnimationsComplete() fires when transition/animation ends
  3. THEN remove node from DOM + run cleanups + resolve promise
  4. Restore focus to previous dialog (or trigger)
```

**Stack transitions with animation:**

When dialog B opens on top of dialog A:
1. A gets `data-dialog-depth="1"` and `data-state="background"` — can animate to dimmed/scaled state
2. B gets `data-dialog-depth="0"` and `data-state="open"` — animates in

When B closes:
1. B gets `data-state="closed"` — animates out
2. After B's exit animation completes: B removed from DOM
3. A gets `data-dialog-depth="0"` and `data-state="open"` — animates back to foreground

**CSS hook example:**

```css
[data-dialog-wrapper] {
  /* Enter */
  &[data-state="open"] {
    animation: dialog-in 200ms ease-out;
  }
  /* Exit — plays before DOM removal */
  &[data-state="closed"] {
    animation: dialog-out 150ms ease-in;
  }
  /* Background — dimmed while another dialog is on top */
  &[data-state="background"] {
    opacity: 0.4;
    scale: 0.95;
    transition: opacity 200ms, scale 200ms;
  }
}
```

**Implementation detail:** Each stack entry's wrapper element gets `data-state` and `data-dialog-depth` attributes. The stack manages these attributes. CSS handles the actual animation. The stack uses `onAnimationsComplete()` (already available from `@vertz/ui/internals`) to wait for exit animations before removing the node.

### 1.10 Complete example — end-to-end

```tsx
// dialogs/confirm-delete.tsx
import type { DialogHandle } from '@vertz/ui';

interface ConfirmDeleteProps {
  name: string;
}

function ConfirmDeleteDialog({ name, dialog }: ConfirmDeleteProps & { dialog: DialogHandle<boolean> }) {
  return (
    <div class="dialog-panel" role="alertdialog" aria-modal="true">
      <h2>Delete "{name}"?</h2>
      <p>This action cannot be undone.</p>
      <div class="dialog-actions">
        <button onClick={() => dialog.close(false)}>Cancel</button>
        <button onClick={() => dialog.close(true)}>Delete</button>
      </div>
    </div>
  );
}

export { ConfirmDeleteDialog };

// pages/project-list.tsx
import { useDialogStack, DialogDismissedError } from '@vertz/ui';
import { ConfirmDeleteDialog } from '../dialogs/confirm-delete';

function ProjectListPage() {
  const dialogs = useDialogStack();
  const projects = query(() => fetchProjects(), { key: 'projects' });

  async function handleDelete(project: Project) {
    try {
      const confirmed = await dialogs.open(ConfirmDeleteDialog, {
        name: project.name,
      });
      if (confirmed) {
        await deleteProject(project.id);
      }
    } catch (e) {
      if (!(e instanceof DialogDismissedError)) throw e;
      // Dismissed — no action
    }
  }

  return (
    <ul>
      {projects.data.map((p) => (
        <li key={p.id}>
          {p.name}
          <button onClick={() => handleDelete(p)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}

// app.tsx
import { DialogStackProvider } from '@vertz/ui';

function App() {
  return (
    <DialogStackProvider>
      <AppShell />
    </DialogStackProvider>
  );
}
```

---

## 2. Context Inheritance — The Critical Design Problem

### 2.1 The problem

When a dialog is opened from inside a component, the dialog renders at the `DialogStackProvider` level (near the root). But the calling component may be nested deep inside context providers that the dialog needs access to.

```
<DialogStackProvider>        ← dialogs render HERE
  <ThemeProvider>
    <ProjectProvider>
      <ProjectCard>
        // onClick → dialogs.open(ConfirmDelete, { ... })
        // ConfirmDelete needs ThemeContext ✓ (above DialogStackProvider? depends on tree)
        // ConfirmDelete needs ProjectContext ✗ (below DialogStackProvider)
      </ProjectCard>
    </ProjectProvider>
  </ThemeProvider>
</DialogStackProvider>
```

This is a well-known problem in React (portals, dialog libraries) that causes real production bugs.

### 2.2 The solution — eager context capture at `useDialogStack()` time

Vertz's context is a `Map` snapshot (`ContextScope`). `getContextScope()` returns the complete map of all active context values, and `setContextScope()` restores it.

**Critical constraint:** `getContextScope()` only works during component factory execution (when Providers are on the call stack). Inside event handlers like `onClick`, the scope is `null` — no Provider is actively executing. Since `dialogs.open()` is primarily called from event handlers, we **cannot** capture scope at `open()` time.

**Solution:** Capture the scope eagerly when `useDialogStack()` is called — during component initialization, when the full context chain IS available.

```tsx
export function useDialogStack(): DialogStack {
  const stack = useContext(DialogStackContext);
  if (!stack) {
    throw new Error('useDialogStack() must be called within DialogStackProvider');
  }

  // Capture scope NOW — during component factory execution.
  // This scope contains ALL contexts active at the component that
  // called useDialogStack(), including nested Providers.
  const capturedScope = getContextScope();

  // Return a wrapper that uses capturedScope for every open() call
  return {
    open<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
    ): Promise<TResult> {
      return stack.openWithScope(component, props, capturedScope);
    },
    get size() { return stack.size; },
    closeAll() { stack.closeAll(); },
  };
}
```

**What this gives us:**

```tsx
// The dialog inherits ALL contexts from the component that called
// useDialogStack() — even though it physically renders at the
// DialogStackProvider level, and even though open() is called
// from an event handler where getContextScope() would be null.

function ConfirmDeleteDialog({ name, dialog }: Props & { dialog: DialogHandle<boolean> }) {
  const theme = useContext(ThemeContext);     // ✓ Works — captured from call site component
  const project = useContext(ProjectContext); // ✓ Works — captured from call site component
  const router = useRouter();                // ✓ Works — captured from call site component
  // ...
}
```

**Why this works in Vertz but is hard in React:**

Vertz's context is a `Map` snapshot, not a tree of Provider components. Restoring it is a single `setContextScope()` call — no need to replay a Provider tree or wrap the dialog in a chain of Providers.

**What gets captured:** The scope at `useDialogStack()` call time — which is the scope of the component that called it. If that component is nested inside `<ThemeProvider>` → `<ProjectProvider>`, the captured scope contains both.

### 2.3 Edge cases and guarantees

| Scenario | Behavior |
|----------|----------|
| Dialog reads context from call site component | Works — scope captured at `useDialogStack()` time |
| `dialogs.open()` called from `onClick` handler | Works — scope was captured eagerly, not at `open()` time |
| Dialog reads context from DialogStackProvider level | Works — DialogStackProvider's contexts are ancestors and part of the scope |
| Call site context changes after dialog opens | Signal-backed values are live (signals are references). Non-signal values are snapshot. |
| Dialog provides its own context to children | Works — `Provider()` inside the dialog pushes onto the captured scope |
| Two components call `useDialogStack()` from different context trees | Each captures its own scope independently |
| `useDialogStack()` called outside any Provider | Scope is `null` — dialog gets only DialogStackProvider-level contexts |

### 2.4 Signal reactivity within captured contexts

Context values that are signals remain reactive. The scope captures the context entries (which may contain signals), not their current values. If a context provides `{ theme: Signal<'light' | 'dark'> }`, the dialog reads the live signal — theme changes are reflected in the dialog.

```tsx
// ThemeContext provides { theme: Signal<string> }
// The captured scope contains the Signal reference, not "light" or "dark"
// So theme changes while the dialog is open are reactive

function MyDialog() {
  const { theme } = useSettings(); // reads the live signal
  // If theme changes from 'light' to 'dark', the dialog updates
}
```

### 2.5 Alternative approaches considered

| Approach | Why rejected |
|----------|-------------|
| **Explicit context passing** — `dialogs.open(Dialog, props, { contexts: [...] })` | Boilerplate, error-prone, violates "one way to do things." Developers forget to pass contexts. |
| **DialogStackProvider inherits parent contexts** — render dialogs inside the Provider tree | Only works for contexts above the Provider, not below. Doesn't solve the real problem. |
| **React-style Portal** — maintain logical tree position | Vertz doesn't have a virtual DOM or reconciler. No tree position to maintain. |
| **Re-wrap with all Providers** — replay the Provider chain around the dialog | Requires knowing which Providers exist. Fragile. Context scope capture is the native Vertz solution. |

---

## 3. Manifesto Alignment

| Principle | How this design aligns |
|-----------|----------------------|
| **"One Way to Do Things"** | There is one way to open a dialog: `dialogs.open(Component, props)`. No declarative alternative, no prop threading, no manual state management. |
| **"If it builds, it works"** | `dialogs.open<TResult, TProps>(Component, props)` is fully typed. Wrong props → compile error. Wrong result type → compile error. |
| **"My LLM nailed it on the first try"** | The pattern is simple: define a component, call `dialogs.open()`, `await` the result. An LLM can generate this correctly from a one-line description. |
| **"Explicit over implicit"** | The dialog component is a regular function — no hidden lifecycle, no magic registration. `useDialog().close(result)` is the explicit way to return a value. |
| **"Predictability over convenience"** | Stack behavior is deterministic: push on open, pop on close, LIFO order. No surprising re-renders, no stale closures. |

### Tradeoffs accepted

- **Imperative over declarative:** Dialogs are opened via function calls, not JSX. This is intentional — declarative dialog placement (wrapping buttons in dialog JSX) creates coupling between the trigger and the dialog that doesn't need to exist.
- **Context snapshot, not live tree:** The dialog's context is captured at `open()` time. If the calling component's Provider is removed from the tree, the dialog still has its captured contexts. This is a feature, not a limitation — dialogs should be independent of the lifecycle of the component that opened them.

---

## 4. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| **Declarative dialog placement** | The whole point is to avoid putting dialog JSX in the component tree. If someone wants declarative, they use the Dialog primitive directly. |
| **Dialog routing** | Dialogs are not routes. No URL-based dialog state. This avoids the complexity of syncing dialog stack with browser history. |
| **Drag/resize** | Not a dialog stack concern. Consumer can implement with CSS/JS on the dialog element. |
| **Toast/notification system** | Toasts have different lifecycle (auto-dismiss, queue, position). Separate concern. |
| **Nested DialogStackProviders** | One stack per app. If needed in the future, it's additive. |
| **Custom backdrop per dialog** | The stack manages the backdrop. Individual dialogs control their content, not the overlay. |

---

## 5. Unknowns

### OQ-1: ~~Should `close()` accept `undefined` for dialogs with no return value?~~ (Resolved)

**Resolution:** `close()` uses a conditional rest parameter: `close(...args: void extends TResult ? [] : [result: TResult])`. When `TResult` is `void`, `close()` takes no arguments. When `TResult` is `boolean`, `close(true)` is required. This is explicit AND convenient.

### OQ-2: ~~Animation coordination between stack entries~~ (Resolved)

**Resolution:** Three-state model via `data-state` attribute:
- `"open"` — visible, foreground (enter animation)
- `"background"` — visible but dimmed/scaled (transition)
- `"closed"` — exit animation playing, DOM removal after `onAnimationsComplete()`

This avoids the need for a POC — it reuses the same `onAnimationsComplete()` mechanism that Dialog/Sheet/AlertDialog already use. CSS handles the actual animation via `data-state` selectors. See section 1.9.

### OQ-3: Focus management across stacked dialogs (Discussion-resolvable)

When dialog B opens on top of A:
- Focus moves to B (established pattern from AlertDialog primitive)
- A's focus trap is deactivated

When B closes and A is revealed:
- Should focus return to A's previously focused element?
- Or to A's first focusable element?

**Recommendation:** Restore focus to A's previously focused element (same pattern as Dialog primitive's `saveFocus()`/`restoreFocus()`). Each stack entry saves and restores its own focus state.

---

## 6. Type Flow Map

```
DialogComponent<TResult, TProps> defines: (props: TProps & { dialog: DialogHandle<TResult> }) => Node
  → dialogs.open(component, props)
    → TypeScript infers TResult and TProps from the component signature
    → Stack injects { dialog: DialogHandle<TResult> } into the props
    → Component receives typed dialog.close(result: TResult)
    → close() resolves Promise<TResult>
```

**Type safety path — zero casts:**
- `TProps` flows from the component parameter type to `open()`'s second argument — wrong props → compile error
- `TResult` flows from the component's `DialogHandle<TResult>` prop to `open()`'s return `Promise<TResult>` — inferred, not manually specified
- `dialog.close(result)` enforces `TResult` — can't close with wrong type
- No `as` casts anywhere in the chain — types flow naturally through the function signature

**Type test assertions:**
- `open(ConfirmDialog, { name: 'test' })` returns `Promise<boolean>` — `expectTypeOf`
- `@ts-expect-error`: `open(ConfirmDialog, { wrong: 123 })` — wrong props
- `@ts-expect-error`: `dialog.close('string')` when `TResult` is `boolean` — wrong result type
- `open(InfoDialog, {})` returns `Promise<void>` — void result
- Dismissal: `await dialogs.open(...)` can throw `DialogDismissedError`

---

## 7. E2E Acceptance Test

```tsx
describe('Feature: Dialog Stack — imperative, promise-based dialog management', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a DialogStackProvider in the app tree', () => {
    it('opens a dialog and resolves with the close value', async () => {
      function ConfirmDialog({ message, dialog }: { message: string } & { dialog: DialogHandle<boolean> }) {
        return (
          <div>
            <p>{message}</p>
            <button onClick={() => dialog.close(true)}>OK</button>
          </div>
        );
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        dialogs = useDialogStack();
      });

      const result = dialogs!.open(ConfirmDialog, { message: 'Are you sure?' });

      // Dialog is rendered in the container
      expect(container.textContent).toContain('Are you sure?');

      // Click OK
      container.querySelector('button')!.click();

      // Promise resolves with true (after exit animation)
      expect(await result).toBe(true);
    });
  });

  describe('Given two stacked dialogs', () => {
    it('backgrounds the first when the second opens, reveals it when the second closes', async () => {
      function DialogA({ dialog }: { dialog: DialogHandle<string> }) {
        return <div data-testid="dialog-a">Dialog A</div>;
      }

      function DialogB({ dialog }: { dialog: DialogHandle<void> }) {
        return (
          <div data-testid="dialog-b">
            <button onClick={() => dialog.close()}>Close B</button>
          </div>
        );
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        dialogs = useDialogStack();
      });

      // Open DialogA
      const resultA = dialogs!.open(DialogA, {});
      const wrapperA = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
      expect(wrapperA.getAttribute('data-state')).toBe('open');

      // Open DialogB on top — DialogA goes to background
      const resultB = dialogs!.open(DialogB, {});
      expect(wrapperA.getAttribute('data-state')).toBe('background');

      const wrapperB = container.querySelectorAll('[data-dialog-wrapper]')[1] as HTMLElement;
      expect(wrapperB.getAttribute('data-state')).toBe('open');

      // Close DialogB — DialogA revealed
      container.querySelector('[data-testid="dialog-b"] button')!.click();
      await resultB;
      expect(wrapperA.getAttribute('data-state')).toBe('open');
    });
  });

  describe('Given a dialog opened from a component with context', () => {
    it('the dialog inherits the context captured at useDialogStack() time', async () => {
      const ProjectContext = createContext<string>();
      let capturedProject: string | undefined;

      function ConfirmDialog({ dialog }: { dialog: DialogHandle<void> }) {
        capturedProject = useContext(ProjectContext);
        return <button onClick={() => dialog.close()}>OK</button>;
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        // useDialogStack() called inside ProjectContext.Provider
        // — captures the scope including ProjectContext
        ProjectContext.Provider('my-project', () => {
          dialogs = useDialogStack();
        });
      });

      // open() called from outside any Provider (simulating event handler)
      // — uses the scope captured at useDialogStack() time
      dialogs!.open(ConfirmDialog, {});

      expect(capturedProject).toBe('my-project');

      container.querySelector('button')!.click();
    });
  });

  describe('Given Escape key pressed on a dismissible dialog', () => {
    it('rejects the promise with DialogDismissedError', async () => {
      function InfoDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return <div>Info</div>;
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        dialogs = useDialogStack();
      });

      const result = dialogs!.open(InfoDialog, {});

      // Press Escape
      const wrapper = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      await expect(result).rejects.toBeInstanceOf(DialogDismissedError);
    });
  });

  describe('Given closeAll() is called', () => {
    it('dismisses all dialogs in the stack', async () => {
      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return <div>Simple</div>;
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        dialogs = useDialogStack();
      });

      const r1 = dialogs!.open(SimpleDialog, {});
      const r2 = dialogs!.open(SimpleDialog, {});
      expect(dialogs!.size).toBe(2);

      dialogs!.closeAll();

      await expect(r1).rejects.toBeInstanceOf(DialogDismissedError);
      await expect(r2).rejects.toBeInstanceOf(DialogDismissedError);
      expect(dialogs!.size).toBe(0);
    });
  });

  describe('Animation support', () => {
    it('sets data-state="closed" on close and waits for animation before DOM removal', async () => {
      function MyDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
        return <button onClick={() => dialog.close(true)}>Done</button>;
      }

      let dialogs: DialogStack;
      DialogStackContext.Provider(createDialogStack(container), () => {
        dialogs = useDialogStack();
      });

      dialogs!.open(MyDialog, {});
      const wrapper = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
      expect(wrapper.getAttribute('data-state')).toBe('open');

      // Click close
      container.querySelector('button')!.click();

      // data-state changes immediately — animation starts
      expect(wrapper.getAttribute('data-state')).toBe('closed');

      // Wrapper is still in DOM until animation completes
      expect(container.querySelector('[data-dialog-wrapper]')).toBeTruthy();

      // After onAnimationsComplete fires, wrapper is removed
      // (In tests without CSS animations, this fires synchronously)
    });
  });
});
```

---

## 8. Implementation Sketch

### Internal stack entry

```tsx
interface StackEntry<TResult = unknown> {
  id: number;
  wrapper: HTMLDivElement;  // outer wrapper with data-state, data-dialog-depth
  node: Node;               // the dialog component's rendered output
  resolve: (result: TResult) => void;
  reject: (error: Error) => void;
  cleanups: (() => void)[];
  savedFocus: (() => void) | null;
  dismissible: boolean;
}
```

### createDialogStack()

```tsx
function createDialogStack(container: HTMLElement): InternalDialogStack {
  const entries: StackEntry[] = [];
  let nextId = 0;

  function openWithScope<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    capturedScope: ContextScope | null,
    options?: { dismissible?: boolean },
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const dismissible = options?.dismissible ?? true;

      // 1. Background current top entry (if any)
      if (entries.length > 0) {
        const current = entries[entries.length - 1];
        setDataState(current.wrapper, 'background');
      }

      // 2. Create wrapper with animation hooks
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-dialog-wrapper', '');
      wrapper.setAttribute('data-state', 'open');
      wrapper.setAttribute('data-dialog-depth', '0');

      const entry: StackEntry<TResult> = {
        id: nextId++,
        wrapper,
        node: null!,
        resolve,
        reject,
        cleanups: [],
        savedFocus: saveFocus(),
        dismissible,
      };

      // 3. Render dialog within captured context scope
      const prevScope = setContextScope(capturedScope);

      const handle: DialogHandle<TResult> = {
        close: (result: TResult) => closeEntry(entry, result),
      };
      entry.node = component({ ...props, dialog: handle });

      setContextScope(prevScope);

      // 4. Mount, update depth indices, trap focus
      wrapper.appendChild(entry.node);
      container.appendChild(wrapper);
      entries.push(entry);
      updateDepthAttributes();
      trapFocus(wrapper);

      // 5. Escape key handler (on wrapper)
      if (dismissible) {
        wrapper.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            dismissEntry(entry);
          }
        });
      }
    });
  }

  function closeEntry<TResult>(entry: StackEntry<TResult>, result: TResult) {
    const idx = entries.indexOf(entry);
    if (idx === -1) return;

    // 1. Trigger exit animation
    setDataState(entry.wrapper, 'closed');

    // 2. Wait for animation, THEN remove from DOM
    onAnimationsComplete(entry.wrapper, () => {
      // Run cleanups
      runCleanups(entry.cleanups);

      // Remove from DOM
      container.removeChild(entry.wrapper);
      entries.splice(idx, 1);

      // Reveal previous entry
      if (entries.length > 0) {
        const prev = entries[entries.length - 1];
        setDataState(prev.wrapper, 'open');
      }
      updateDepthAttributes();

      // Restore focus
      entry.savedFocus?.();

      // Resolve the promise
      entry.resolve(result);
    });
  }

  function dismissEntry(entry: StackEntry) {
    const idx = entries.indexOf(entry);
    if (idx === -1) return;

    setDataState(entry.wrapper, 'closed');
    onAnimationsComplete(entry.wrapper, () => {
      runCleanups(entry.cleanups);
      container.removeChild(entry.wrapper);
      entries.splice(idx, 1);

      if (entries.length > 0) {
        const prev = entries[entries.length - 1];
        setDataState(prev.wrapper, 'open');
      }
      updateDepthAttributes();
      entry.savedFocus?.();
      entry.reject(new DialogDismissedError());
    });
  }

  function updateDepthAttributes() {
    for (let i = 0; i < entries.length; i++) {
      const depth = entries.length - 1 - i;
      entries[i].wrapper.setAttribute('data-dialog-depth', String(depth));
    }
  }

  return {
    openWithScope,
    get size() { return entries.length; },
    closeAll() {
      // Dismiss from top to bottom
      for (let i = entries.length - 1; i >= 0; i--) {
        dismissEntry(entries[i]);
      }
    },
  };
}
```

---

## 9. Relationship to Primitives

The dialog stack is a **higher-level orchestration layer** built on top of the existing primitives:

| Layer | Responsibility | Package |
|-------|---------------|---------|
| **Primitives** (Dialog, AlertDialog, Sheet) | ARIA attributes, focus trapping, animation timing, keyboard handling | `@vertz/ui-primitives` |
| **Dialog Stack** | Opening/closing lifecycle, promise resolution, context capture, stack management | `@vertz/ui` |
| **Consumer** | Dialog content, styling, business logic | App code |

Dialog components can use primitives internally for accessibility, or use raw elements with manual ARIA (the stack handles context and lifecycle, not accessibility).

---

## 10. Follow-ups (tracked)

| Item | Description | Priority |
|------|-------------|----------|
| **Sheet integration** | `dialogs.openSheet(Component, props, { side: 'left' })` — slides from edge instead of centered overlay | Should-have |
| **Dialog presets** | `dialogs.confirm({ title, message })` — common patterns as one-liners | Nice-to-have |
| **Back button integration** | Pressing browser back closes top dialog instead of navigating | Nice-to-have |
| **Scroll lock** | Prevent body scroll while a dialog is open (`overflow: hidden` on body) | Should-have |
| **Route navigation dismissal** | Close all dialogs when the user navigates to a different route | Should-have |
