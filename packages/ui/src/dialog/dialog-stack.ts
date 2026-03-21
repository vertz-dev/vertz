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
    ): Promise<DialogResult<TResult>> {
      return stack.openWithScope(component, props, capturedScope);
    },
    openWithScope: stack.openWithScope,
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

export interface DialogStack {
  open<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
  ): Promise<DialogResult<TResult>>;

  /** @internal — used by useDialogStack() to pass captured context scope */
  openWithScope<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    scope: ContextScope | null,
  ): Promise<DialogResult<TResult>>;

  readonly size: number;

  closeAll(): void;
}

// ── Internal types ──

interface StackEntry {
  id: number;
  wrapper: HTMLDivElement;
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
  const container = __element('div', { 'data-dialog-container': '' }) as HTMLDivElement;
  const stack = createDialogStack(container);

  return DialogStackContext.Provider({
    value: stack,
    children: () => {
      const frag = document.createDocumentFragment();
      __insert(frag, children as Node | string | (() => unknown) | null | undefined);
      frag.appendChild(container);
      return frag;
    },
  });
}

// ── Implementation ──

export function createDialogStack(container: HTMLElement): DialogStack {
  const entries: StackEntry[] = [];
  let nextId = 0;

  function open<TResult, TProps>(
    component: DialogComponent<TResult, TProps>,
    props: TProps,
    capturedScope?: ContextScope | null,
  ): Promise<DialogResult<TResult>> {
    return new Promise<DialogResult<TResult>>((resolve) => {
      // Background current top entry
      if (entries.length > 0) {
        entries[entries.length - 1]!.wrapper.setAttribute('data-state', 'background');
      }

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-dialog-wrapper', '');
      wrapper.setAttribute('data-state', 'open');
      wrapper.setAttribute('data-dialog-depth', '0');

      const entry: StackEntry = {
        id: nextId++,
        wrapper,
        node: null!,
        resolve: resolve as (result: DialogResult<unknown>) => void,
        cleanups: [],
        dismissible: true,
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

      entry.node = component({ ...props, dialog: handle });

      entry.cleanups = [...scope];
      popScope();
      setContextScope(prevScope);

      // Escape key handler — only dismisses if this is the topmost entry
      if (entry.dismissible) {
        wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Escape' && entries[entries.length - 1] === entry) {
            e.preventDefault();
            e.stopPropagation();
            dismissEntry(entry);
          }
        });
      }

      // Mount
      wrapper.appendChild(entry.node);
      container.appendChild(wrapper);
      entries.push(entry);
      updateDepthAttributes();
    });
  }

  function closeEntry(entry: StackEntry, result: unknown): void {
    if (entry.settled) return;
    const idx = entries.indexOf(entry);
    if (idx === -1) return;
    entry.settled = true;

    // Set closed state for exit animation
    entry.wrapper.setAttribute('data-state', 'closed');

    onAnimationsComplete(entry.wrapper, () => {
      runCleanups(entry.cleanups);

      if (entry.wrapper.parentNode === container) {
        container.removeChild(entry.wrapper);
      }

      const entryIdx = entries.indexOf(entry);
      if (entryIdx !== -1) {
        entries.splice(entryIdx, 1);
      }

      // Reveal previous entry
      if (entries.length > 0) {
        entries[entries.length - 1]!.wrapper.setAttribute('data-state', 'open');
      }
      updateDepthAttributes();

      entry.resolve({ ok: true, data: result });
    });
  }

  function updateDepthAttributes(): void {
    for (let i = 0; i < entries.length; i++) {
      entries[i]!.wrapper.setAttribute('data-dialog-depth', String(entries.length - 1 - i));
    }
  }

  return {
    open<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
    ): Promise<DialogResult<TResult>> {
      return open(component, props);
    },
    openWithScope<TResult, TProps>(
      component: DialogComponent<TResult, TProps>,
      props: TProps,
      scope: ContextScope | null,
    ): Promise<DialogResult<TResult>> {
      return open(component, props, scope);
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

    entry.wrapper.setAttribute('data-state', 'closed');
    onAnimationsComplete(entry.wrapper, () => {
      runCleanups(entry.cleanups);

      if (entry.wrapper.parentNode === container) {
        container.removeChild(entry.wrapper);
      }

      const entryIdx = entries.indexOf(entry);
      if (entryIdx !== -1) {
        entries.splice(entryIdx, 1);
      }

      if (entries.length > 0) {
        entries[entries.length - 1]!.wrapper.setAttribute('data-state', 'open');
      }
      updateDepthAttributes();

      entry.resolve({ ok: false });
    });
  }
}
