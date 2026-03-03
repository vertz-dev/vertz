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

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      onClick={() => {
        if (!state.open.peek()) show();
      }}
    />
  ) as HTMLButtonElement;

  const overlay = (
    <div
      data-alertdialog-overlay=""
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={defaultOpen ? '' : 'display: none'}
    />
  ) as HTMLDivElement;

  const content = (
    <div
      role="alertdialog"
      id={ids.contentId}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={defaultOpen ? '' : 'display: none'}
    />
  ) as HTMLDivElement;

  // biome-ignore lint/a11y/useHeadingContent: primitive — consumer provides content
  const title = (<h2 id={titleId} />) as HTMLHeadingElement;

  const description = (<p id={descriptionId} />) as HTMLParagraphElement;

  const cancel = (<button type="button" onClick={() => hide()} />) as HTMLButtonElement;

  const action = (
    <button
      type="button"
      onClick={() => {
        onAction?.();
        hide();
      }}
    />
  ) as HTMLButtonElement;

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
