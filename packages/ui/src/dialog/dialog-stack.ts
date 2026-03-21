import type { ContextScope } from '../component/context';
import { createContext, getContextScope, setContextScope, useContext } from '../component/context';
import { onAnimationsComplete } from '../dom/animation';
import { __element, __insert } from '../dom/element';
import { popScope, pushScope, runCleanups } from '../runtime/disposal';
import type { DisposeFn } from '../runtime/signal-types';

// ── Context ──

import type { Context } from '../component/context';

export const DialogStackContext: Context<DialogStack> = createContext<DialogStack>(
  undefined,
  '@vertz/ui::DialogStackContext',
);

export const DialogHandleContext: Context<DialogHandle<unknown>> = createContext<
  DialogHandle<unknown>
>(undefined, '@vertz/ui::DialogHandleContext');

export const DialogIdContext: Context<string> = createContext<string>(
  undefined,
  '@vertz/ui::DialogIdContext',
);

export function useDialog<T = void>(): DialogHandle<T> {
  const handle = useContext(DialogHandleContext);
  if (!handle) {
    throw new Error('useDialog() must be called within a dialog opened via DialogStack');
  }
  return handle as DialogHandle<T>;
}

export function useDialogStack(): DialogStack {
  const stack = useContext(DialogStackContext);
  if (!stack) {
    throw new Error('useDialogStack() must be called within DialogStackProvider');
  }

  // Capture scope NOW — during component factory execution.
  // Event handlers (onClick etc.) run outside any Provider, so
  // getContextScope() would return null there. By capturing here,
  // every open() call uses the scope from initialization time.
  const capturedScope = getContextScope();

  return {
    open<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
      options?: DialogOpenOptions,
    ): Promise<DialogResult<TResult>> {
      return stack.openWithScope(component, props, capturedScope, options);
    },
    openWithScope: stack.openWithScope,
    confirm(opts: ConfirmOptions): Promise<boolean> {
      return stack.confirm(opts);
    },
    get size() {
      return stack.size;
    },
    closeAll() {
      stack.closeAll();
    },
  };
}

// ── Public types ──

export interface DialogHandle<TResult> {
  close(...args: void extends TResult ? [] : [result: TResult]): void;
}

export type DialogComponent<TResult, TProps = Record<string, never>> = (
  props: TProps & { dialog: DialogHandle<TResult> },
) => Node;

export type DialogResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

export interface DialogOpenOptions {
  /** Whether the dialog can be dismissed by backdrop click or Escape. Default: true */
  dismissible?: boolean;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirm?: string;
  cancel?: string;
  intent?: 'primary' | 'danger';
  dismissible?: boolean;
}

export interface DialogStack {
  open<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    options?: DialogOpenOptions,
  ): Promise<DialogResult<TResult>>;

  /** @internal — used by useDialogStack() to pass captured context scope */
  openWithScope<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    scope: ContextScope | null,
    options?: DialogOpenOptions,
  ): Promise<DialogResult<TResult>>;

  confirm(options: ConfirmOptions): Promise<boolean>;

  readonly size: number;

  closeAll(): void;
}

// ── Internal types ──

interface StackEntry {
  id: number;
  dialogEl: HTMLDialogElement;
  panel: HTMLDivElement;
  node: Node;
  resolve: (result: DialogResult<unknown>) => void;
  cleanups: DisposeFn[];
  dismissible: boolean;
  settled: boolean;
}

// ── Provider ──

/**
 * Manages the dialog container element and provides DialogStack via context.
 *
 * Creates a hydration-safe container div via `__element`, initializes the
 * dialog stack, and wraps children in `DialogStackContext.Provider`.
 * The container renders after children — dialogs portal into it.
 */
export function DialogStackProvider({ children }: { children?: unknown }): HTMLElement {
  const container = __element('div', { 'data-dialog-container': '' });
  const stack = createDialogStack(container);

  return DialogStackContext.Provider({
    value: stack,
    children: () => {
      const frag = document.createDocumentFragment();
      __insert(frag, children as Parameters<typeof __insert>[1]);
      frag.appendChild(container);
      return frag;
    },
  });
}

// ── Built-in confirm component (imperative DOM — no compiler) ──

function ConfirmDialogComponent({
  title,
  description,
  confirm: confirmLabel = 'Confirm',
  cancel: cancelLabel = 'Cancel',
  intent = 'primary',
  dialog,
}: ConfirmOptions & { dialog: DialogHandle<boolean> }): Node {
  const frag = document.createDocumentFragment();

  // Title
  const titleEl = document.createElement('h2');
  titleEl.setAttribute('data-part', 'title');
  titleEl.textContent = title;
  frag.appendChild(titleEl);

  // Description (optional)
  if (description) {
    const descEl = document.createElement('p');
    descEl.setAttribute('data-part', 'description');
    descEl.textContent = description;
    frag.appendChild(descEl);
  }

  // Footer
  const footer = document.createElement('div');
  footer.setAttribute('data-part', 'footer');

  const cancelBtn = document.createElement('button');
  cancelBtn.setAttribute('type', 'button');
  cancelBtn.setAttribute('data-part', 'confirm-cancel');
  cancelBtn.textContent = cancelLabel;
  cancelBtn.addEventListener('click', () => dialog.close(false));

  const confirmBtn = document.createElement('button');
  confirmBtn.setAttribute('type', 'button');
  confirmBtn.setAttribute('data-part', 'confirm-action');
  confirmBtn.setAttribute('data-intent', intent);
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener('click', () => dialog.close(true));

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);
  frag.appendChild(footer);

  return frag;
}

// ── Implementation ──

export function createDialogStack(container: HTMLElement): DialogStack {
  const entries: StackEntry[] = [];
  let nextId = 0;

  function open<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    capturedScope?: ContextScope | null,
    options?: DialogOpenOptions,
  ): Promise<DialogResult<TResult>> {
    return new Promise<DialogResult<TResult>>((resolve) => {
      // Background current top entry
      if (entries.length > 0) {
        entries[entries.length - 1]!.dialogEl.setAttribute('data-state', 'background');
      }

      const dialogId = `dlg-${nextId}`;

      // Create native <dialog> wrapper
      const dialogEl = document.createElement('dialog');
      dialogEl.setAttribute('data-dialog-wrapper', '');
      dialogEl.setAttribute('data-state', 'open');
      dialogEl.setAttribute('data-dialog-depth', '0');

      // Create panel div with ARIA attributes
      const panel = document.createElement('div');
      panel.setAttribute('data-part', 'panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', `${dialogId}-title`);
      panel.setAttribute('aria-describedby', `${dialogId}-desc`);
      dialogEl.appendChild(panel);

      const entry: StackEntry = {
        id: nextId++,
        dialogEl,
        panel,
        node: null!,
        resolve: resolve as (result: DialogResult<unknown>) => void,
        cleanups: [],
        dismissible: options?.dismissible !== false,
        settled: false,
      };

      // Render within captured context scope
      const prevScope = setContextScope(capturedScope ?? null);
      const scope = pushScope();

      const handle: DialogHandle<TResult> = {
        close: ((...args: unknown[]) => {
          closeEntry(entry, args[0] as TResult);
        }) as DialogHandle<TResult>['close'],
      };

      // Provide contexts, then render component inside them
      DialogHandleContext.Provider(handle as DialogHandle<unknown>, () => {
        DialogIdContext.Provider(dialogId, () => {
          entry.node = component({ ...props, dialog: handle });
        });
      });

      entry.cleanups = [...scope];
      popScope();
      setContextScope(prevScope);

      // Always prevent native cancel (Escape) — we manage close ourselves
      dialogEl.addEventListener('cancel', (e: Event) => {
        e.preventDefault();
        if (entry.dismissible && entries[entries.length - 1] === entry) {
          dismissEntry(entry);
        }
      });

      // Backdrop click — dismiss if click is outside the panel
      dialogEl.addEventListener('click', (e: MouseEvent) => {
        if (!entry.dismissible) return;
        const rect = panel.getBoundingClientRect();
        const isOutside =
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        if (isOutside) {
          dismissEntry(entry);
        }
      });

      // Mount
      panel.appendChild(entry.node);
      container.appendChild(dialogEl);
      entries.push(entry);
      updateDepthAttributes();

      // Open as modal for focus trap + top layer
      dialogEl.showModal();
    });
  }

  function closeEntry(entry: StackEntry, result: unknown): void {
    if (entry.settled) return;
    const idx = entries.indexOf(entry);
    if (idx === -1) return;
    entry.settled = true;

    // Set closed state for exit animation + prevent interaction
    entry.dialogEl.setAttribute('data-state', 'closed');
    entry.dialogEl.setAttribute('inert', '');

    onAnimationsComplete(entry.dialogEl, () => {
      runCleanups(entry.cleanups);

      // Close the native dialog
      if (entry.dialogEl.open) {
        entry.dialogEl.close();
      }

      if (entry.dialogEl.parentNode === container) {
        container.removeChild(entry.dialogEl);
      }

      const entryIdx = entries.indexOf(entry);
      if (entryIdx !== -1) {
        entries.splice(entryIdx, 1);
      }

      // Reveal previous entry
      if (entries.length > 0) {
        entries[entries.length - 1]!.dialogEl.setAttribute('data-state', 'open');
      }
      updateDepthAttributes();

      entry.resolve({ ok: true, data: result });
    });
  }

  function updateDepthAttributes(): void {
    for (let i = 0; i < entries.length; i++) {
      entries[i]!.dialogEl.setAttribute('data-dialog-depth', String(entries.length - 1 - i));
    }
  }

  return {
    open<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
      options?: DialogOpenOptions,
    ): Promise<DialogResult<TResult>> {
      return open(component, props, undefined, options);
    },
    openWithScope<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
      scope: ContextScope | null,
      options?: DialogOpenOptions,
    ): Promise<DialogResult<TResult>> {
      return open(component, props, scope, options);
    },
    async confirm(opts: ConfirmOptions): Promise<boolean> {
      const result = await open<boolean, ConfirmOptions>(ConfirmDialogComponent, opts, undefined, {
        dismissible: opts.dismissible ?? false,
      });
      return result.ok ? result.data : false;
    },
    get size() {
      return entries.length;
    },
    closeAll() {
      for (let i = entries.length - 1; i >= 0; i--) {
        dismissEntry(entries[i]!);
      }
    },
  };

  function dismissEntry(entry: StackEntry): void {
    if (entry.settled) return;
    const idx = entries.indexOf(entry);
    if (idx === -1) return;
    entry.settled = true;

    entry.dialogEl.setAttribute('data-state', 'closed');
    entry.dialogEl.setAttribute('inert', '');

    onAnimationsComplete(entry.dialogEl, () => {
      runCleanups(entry.cleanups);

      if (entry.dialogEl.open) {
        entry.dialogEl.close();
      }

      if (entry.dialogEl.parentNode === container) {
        container.removeChild(entry.dialogEl);
      }

      const entryIdx = entries.indexOf(entry);
      if (entryIdx !== -1) {
        entries.splice(entryIdx, 1);
      }

      if (entries.length > 0) {
        entries[entries.length - 1]!.dialogEl.setAttribute('data-state', 'open');
      }
      updateDepthAttributes();

      entry.resolve({ ok: false });
    });
  }
}
