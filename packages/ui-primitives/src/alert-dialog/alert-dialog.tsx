/**
 * AlertDialog primitive - modal dialog for confirming destructive actions.
 * Unlike Dialog, AlertDialog requires explicit user action to dismiss:
 * no overlay click, no Escape key.
 * Follows WAI-ARIA alertdialog pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
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
  trigger: HTMLElement;
  overlay: HTMLElement;
  content: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  cancel: HTMLElement;
  action: HTMLElement;
  show: () => void;
  hide: () => void;
}

function AlertDialogTriggerEl(
  triggerId: string,
  contentId: string,
  defaultOpen: boolean,
  onClick: () => void,
): HTMLElement {
  return (
    <button
      type="button"
      id={triggerId}
      aria-controls={contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      onClick={onClick}
    />
  ) as HTMLElement;
}

function AlertDialogOverlayEl(defaultOpen: boolean): HTMLElement {
  return (
    <div
      data-alertdialog-overlay=""
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={{ display: defaultOpen ? '' : 'none' }}
    />
  ) as HTMLElement;
}

function AlertDialogContentEl(
  contentId: string,
  titleId: string,
  descriptionId: string,
  defaultOpen: boolean,
): HTMLElement {
  return (
    <div
      role="alertdialog"
      id={contentId}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={{ display: defaultOpen ? '' : 'none' }}
    />
  ) as HTMLElement;
}

function AlertDialogTitleEl(titleId: string): HTMLElement {
  // biome-ignore lint/a11y/useHeadingContent: primitive — consumer provides content
  return (<h2 id={titleId} />) as HTMLElement;
}

function AlertDialogDescriptionEl(descriptionId: string): HTMLElement {
  return (<p id={descriptionId} />) as HTMLElement;
}

function AlertDialogCancelBtn(onClick: () => void): HTMLElement {
  return (<button type="button" onClick={onClick} />) as HTMLElement;
}

function AlertDialogActionBtn(onClick: () => void): HTMLElement {
  return (<button type="button" onClick={onClick} />) as HTMLElement;
}

function AlertDialogRoot(
  options: AlertDialogOptions = {},
): AlertDialogElements & { state: AlertDialogState } {
  const { defaultOpen = false, onOpenChange, onAction } = options;
  const ids = linkedIds('alertdialog');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;
  const state: AlertDialogState = { open: signal(defaultOpen) };
  let restoreFocus: (() => void) | null = null;
  let removeTrap: (() => void) | null = null;

  function show(): void {
    if (state.open.peek()) return;
    state.open.value = true;
    setExpanded(trigger, true);
    setHidden(overlay, false);
    setHidden(content, false);
    setDataState(trigger, 'open');
    setDataState(overlay, 'open');
    setDataState(content, 'open');

    restoreFocus = saveFocus();
    removeTrap = trapFocus(content);
    queueMicrotask(() => cancel.focus());
    onOpenChange?.(true);
  }

  function hide(): void {
    if (!state.open.peek()) return;
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

  // show() is idempotent — safe to call when already open
  const trigger = AlertDialogTriggerEl(ids.triggerId, ids.contentId, defaultOpen, show);

  const overlay = AlertDialogOverlayEl(defaultOpen);

  const content = AlertDialogContentEl(ids.contentId, titleId, descriptionId, defaultOpen);

  const title = AlertDialogTitleEl(titleId);

  const description = AlertDialogDescriptionEl(descriptionId);

  const cancel = AlertDialogCancelBtn(() => hide());

  const action = AlertDialogActionBtn(() => {
    onAction?.();
    hide();
  });

  if (defaultOpen) {
    restoreFocus = saveFocus();
    removeTrap = trapFocus(content);
    queueMicrotask(() => cancel.focus());
  }

  return { trigger, overlay, content, title, description, cancel, action, state, show, hide };
}

export const AlertDialog: {
  Root: (options?: AlertDialogOptions) => AlertDialogElements & { state: AlertDialogState };
} = {
  Root: AlertDialogRoot,
};
