/**
 * Dialog primitive - modal/non-modal dialog with focus trap and Escape to close.
 * Follows WAI-ARIA dialog pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setLabelledBy } from '../utils/aria';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface DialogOptions {
  modal?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface DialogState {
  open: Signal<boolean>;
}

export interface DialogElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  title: HTMLHeadingElement;
  close: HTMLButtonElement;
}

export const Dialog = {
  Root(options: DialogOptions = {}): DialogElements & { state: DialogState } {
    const { modal = true, defaultOpen = false, onOpenChange } = options;
    const ids = linkedIds('dialog');
    const titleId = `${ids.contentId}-title`;
    const state: DialogState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;
    let removeTrap: (() => void) | null = null;

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'dialog');
    content.id = ids.contentId;
    if (modal) {
      content.setAttribute('aria-modal', 'true');
    }
    setLabelledBy(content, titleId);
    setHidden(content, !defaultOpen);
    setDataState(content, defaultOpen ? 'open' : 'closed');

    const title = document.createElement('h2');
    title.id = titleId;

    const close = document.createElement('button');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close');

    function openDialog(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(content, 'open');

      restoreFocus = saveFocus();
      if (modal) {
        removeTrap = trapFocus(content);
      }
      // Focus first focusable element inside content
      queueMicrotask(() => focusFirst(content));
      onOpenChange?.(true);
    }

    function closeDialog(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setHidden(content, true);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');

      removeTrap?.();
      removeTrap = null;
      restoreFocus?.();
      restoreFocus = null;
      onOpenChange?.(false);
    }

    trigger.addEventListener('click', () => {
      if (state.open.peek()) {
        closeDialog();
      } else {
        openDialog();
      }
    });

    close.addEventListener('click', () => {
      closeDialog();
    });

    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      }
    });

    return { trigger, content, title, close, state };
  },
};
