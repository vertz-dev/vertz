/**
 * Dialog primitive - modal/non-modal dialog with focus trap and Escape to close.
 * Follows WAI-ARIA dialog pattern.
 *
 * When modal, provides an overlay element and centers the content via a wrapper.
 * Clicking the overlay closes the dialog.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import {
  setDataState,
  setExpanded,
  setHidden,
  setHiddenAnimated,
  setLabelledBy,
} from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface DialogOptions extends ElementAttrs {
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
  overlay: HTMLDivElement;
  title: HTMLHeadingElement;
  close: HTMLButtonElement;
  show: () => void;
  hide: () => void;
}

function DialogRoot(options: DialogOptions = {}): DialogElements & { state: DialogState } {
  const { modal = true, defaultOpen = false, onOpenChange, ...attrs } = options;
  const ids = linkedIds('dialog');
  const titleId = `${ids.contentId}-title`;
  const state: DialogState = { open: signal(defaultOpen) };
  let restoreFocus: (() => void) | null = null;
  let removeTrap: (() => void) | null = null;

  function openDialog(): void {
    state.open.value = true;
    setExpanded(trigger, true);
    setHidden(overlay, false);
    setHidden(content, false);
    setDataState(trigger, 'open');
    setDataState(overlay, 'open');
    setDataState(content, 'open');

    restoreFocus = saveFocus();
    if (modal) {
      removeTrap = trapFocus(content);
    }
    queueMicrotask(() => focusFirst(content));
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

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      onClick={() => {
        if (state.open.peek()) {
          closeDialog();
        } else {
          openDialog();
        }
      }}
    />
  ) as HTMLButtonElement;

  const overlay = (
    <div
      data-dialog-overlay=""
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={defaultOpen ? '' : 'display: none'}
      onClick={() => closeDialog()}
    />
  ) as HTMLDivElement;

  const content = (
    <div
      role="dialog"
      id={ids.contentId}
      aria-modal={modal ? 'true' : undefined}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={defaultOpen ? '' : 'display: none'}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          closeDialog();
        }
      }}
    />
  ) as HTMLDivElement;

  setLabelledBy(content, titleId);

  // biome-ignore lint/a11y/useHeadingContent: primitive — consumer provides content
  const title = (<h2 id={titleId} />) as HTMLHeadingElement;

  const close = (
    <button type="button" aria-label="Close" onClick={() => closeDialog()} />
  ) as HTMLButtonElement;

  applyAttrs(content, attrs);

  return { trigger, overlay, content, title, close, state, show: openDialog, hide: closeDialog };
}

export const Dialog: {
  Root: (options?: DialogOptions) => DialogElements & { state: DialogState };
} = {
  Root: DialogRoot,
};
