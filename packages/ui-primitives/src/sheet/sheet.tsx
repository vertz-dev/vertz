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

function SheetRoot(options: SheetOptions = {}): SheetElements & { state: SheetState } {
  const { side = 'right', defaultOpen = false, onOpenChange } = options;
  const ids = linkedIds('sheet');
  const state: SheetState = { open: signal(defaultOpen) };
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
    queueMicrotask(() => focusFirst(content));
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

  // ── Swipe-to-dismiss ──
  const SWIPE_THRESHOLD = 50;
  let startX = 0;
  let startY = 0;

  function handlePointerDown(e: PointerEvent) {
    startX = e.clientX;
    startY = e.clientY;
  }

  function handlePointerUp(e: PointerEvent) {
    if (!state.open.peek()) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const shouldDismiss =
      (side === 'right' && deltaX >= SWIPE_THRESHOLD) ||
      (side === 'left' && deltaX <= -SWIPE_THRESHOLD) ||
      (side === 'bottom' && deltaY >= SWIPE_THRESHOLD) ||
      (side === 'top' && deltaY <= -SWIPE_THRESHOLD);

    if (shouldDismiss) {
      hide();
    }
  }

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      onClick={() => {
        state.open.peek() ? hide() : show();
      }}
    />
  ) as HTMLButtonElement;

  const overlay = (
    <div
      data-sheet-overlay=""
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={{ display: defaultOpen ? '' : 'none' }}
      onClick={() => hide()}
    />
  ) as HTMLDivElement;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      id={ids.contentId}
      data-side={side}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={{ display: defaultOpen ? '' : 'none' }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          hide();
        }
      }}
      onPointerdown={handlePointerDown}
      onPointerup={handlePointerUp}
    />
  ) as HTMLDivElement;

  const close = (
    <button type="button" aria-label="Close" onClick={() => hide()} />
  ) as HTMLButtonElement;

  return { trigger, overlay, content, close, state, show, hide };
}

export const Sheet: {
  Root: (options?: SheetOptions) => SheetElements & { state: SheetState };
} = {
  Root: SheetRoot,
};
