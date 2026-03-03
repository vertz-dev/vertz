/**
 * AlertDialog primitive - modal dialog for confirming destructive actions.
 * Unlike Dialog, AlertDialog requires explicit user action to dismiss:
 * no overlay click, no Escape key.
 * Follows WAI-ARIA alertdialog pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import {
  setDataState,
  setDescribedBy,
  setExpanded,
  setHidden,
  setHiddenAnimated,
  setLabelledBy,
} from '../utils/aria';
import { saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';

export interface AlertDialogOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
}

export interface AlertDialogState {
  open: Signal<boolean>;
}

export interface AlertDialogElements {
  trigger: HTMLButtonElement;
  overlay: HTMLDivElement;
  content: HTMLDivElement;
  title: HTMLHeadingElement;
  description: HTMLParagraphElement;
  cancel: HTMLButtonElement;
  action: HTMLButtonElement;
  show: () => void;
  hide: () => void;
}

export const AlertDialog = {
  Root(options: AlertDialogOptions = {}): AlertDialogElements & { state: AlertDialogState } {
    const { defaultOpen = false, onOpenChange, onAction } = options;
    const ids = linkedIds('alertdialog');
    const titleId = `${ids.contentId}-title`;
    const descriptionId = `${ids.contentId}-description`;
    const state: AlertDialogState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;
    let removeTrap: (() => void) | null = null;

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    const overlay = document.createElement('div');
    overlay.setAttribute('data-alertdialog-overlay', '');
    setHidden(overlay, !defaultOpen);
    setDataState(overlay, defaultOpen ? 'open' : 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'alertdialog');
    content.id = ids.contentId;
    content.setAttribute('aria-modal', 'true');
    setLabelledBy(content, titleId);
    setDescribedBy(content, descriptionId);
    setHidden(content, !defaultOpen);
    setDataState(content, defaultOpen ? 'open' : 'closed');

    const title = document.createElement('h2');
    title.id = titleId;

    const description = document.createElement('p');
    description.id = descriptionId;

    const cancel = document.createElement('button');
    cancel.setAttribute('type', 'button');

    const action = document.createElement('button');
    action.setAttribute('type', 'button');

    function openDialog(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(overlay, false);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(overlay, 'open');
      setDataState(content, 'open');

      restoreFocus = saveFocus();
      removeTrap = trapFocus(content);
      // Focus cancel button by default (safest for destructive actions)
      queueMicrotask(() => cancel.focus());
      onOpenChange?.(true);
    }

    function closeDialog(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setDataState(trigger, 'closed');
      setDataState(overlay, 'closed');
      setDataState(content, 'closed');
      setHiddenAnimated(overlay, true);
      setHiddenAnimated(content, true);

      removeTrap?.();
      removeTrap = null;
      restoreFocus?.();
      restoreFocus = null;
      onOpenChange?.(false);
    }

    trigger.addEventListener('click', () => {
      if (!state.open.peek()) {
        openDialog();
      }
    });

    cancel.addEventListener('click', () => {
      closeDialog();
    });

    action.addEventListener('click', () => {
      onAction?.();
      closeDialog();
    });

    if (defaultOpen) {
      restoreFocus = saveFocus();
      removeTrap = trapFocus(content);
      queueMicrotask(() => cancel.focus());
    }

    return {
      trigger,
      overlay,
      content,
      title,
      description,
      cancel,
      action,
      state,
      show: openDialog,
      hide: closeDialog,
    };
  },
};
