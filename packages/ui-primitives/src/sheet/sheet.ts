/**
 * Sheet primitive - a panel that slides in from the edge of the screen.
 * Used for mobile navigation drawers, detail panels, and contextual sidebars.
 * Follows WAI-ARIA dialog pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export type SheetSide = 'left' | 'right' | 'top' | 'bottom';

export interface SheetOptions {
  side?: SheetSide;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface SheetState {
  open: Signal<boolean>;
}

export interface SheetElements {
  trigger: HTMLButtonElement;
  overlay: HTMLDivElement;
  content: HTMLDivElement;
  close: HTMLButtonElement;
  show: () => void;
  hide: () => void;
}

export const Sheet = {
  Root(options: SheetOptions = {}): SheetElements & { state: SheetState } {
    const { side = 'right', defaultOpen = false, onOpenChange } = options;
    const ids = linkedIds('sheet');
    const state: SheetState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;
    let removeTrap: (() => void) | null = null;

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    const overlay = document.createElement('div');
    overlay.setAttribute('data-sheet-overlay', '');
    setHidden(overlay, !defaultOpen);
    setDataState(overlay, defaultOpen ? 'open' : 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    content.id = ids.contentId;
    content.setAttribute('data-side', side);
    setHidden(content, !defaultOpen);
    setDataState(content, defaultOpen ? 'open' : 'closed');

    const close = document.createElement('button');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close');

    function openSheet(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(overlay, false);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(overlay, 'open');
      setDataState(content, 'open');

      restoreFocus = saveFocus();
      removeTrap = trapFocus(content);
      queueMicrotask(() => focusFirst(content));
      onOpenChange?.(true);
    }

    function closeSheet(): void {
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
      if (state.open.peek()) {
        closeSheet();
      } else {
        openSheet();
      }
    });

    close.addEventListener('click', () => {
      closeSheet();
    });

    overlay.addEventListener('click', () => {
      closeSheet();
    });

    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        event.stopPropagation();
        closeSheet();
      }
    });

    // ── Swipe-to-dismiss ──
    const SWIPE_THRESHOLD = 50;
    let startX = 0;
    let startY = 0;

    content.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });

    content.addEventListener('pointerup', (e) => {
      if (!state.open.peek()) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const shouldDismiss =
        (side === 'right' && deltaX >= SWIPE_THRESHOLD) ||
        (side === 'left' && deltaX <= -SWIPE_THRESHOLD) ||
        (side === 'bottom' && deltaY >= SWIPE_THRESHOLD) ||
        (side === 'top' && deltaY <= -SWIPE_THRESHOLD);

      if (shouldDismiss) {
        closeSheet();
      }
    });

    return { trigger, overlay, content, close, state, show: openSheet, hide: closeSheet };
  },
};
