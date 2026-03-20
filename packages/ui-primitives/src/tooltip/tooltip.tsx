/**
 * Tooltip primitive - accessible tooltip with delay and aria-describedby.
 * Follows WAI-ARIA tooltip pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setDescribedBy, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface TooltipOptions extends ElementAttrs {
  delay?: number;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export interface TooltipState {
  open: Signal<boolean>;
}

export interface TooltipElements {
  trigger: HTMLElement;
  content: HTMLElement;
}

function TooltipTrigger(show: () => void, hide: () => void): HTMLElement {
  return (
    <span
      onMouseenter={show}
      onMouseleave={hide}
      onFocus={show}
      onBlur={hide}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          hide();
        }
      }}
    />
  ) as HTMLElement;
}

function TooltipContent(contentId: string): HTMLElement {
  return (
    <div
      role="tooltip"
      id={contentId}
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
    />
  ) as HTMLElement;
}

function TooltipRoot(options: TooltipOptions = {}): TooltipElements & { state: TooltipState } {
  const { delay = 300, onOpenChange, positioning, ...attrs } = options;
  const contentId = uniqueId('tooltip');
  const state: TooltipState = { open: signal(false) };
  let showTimeout: ReturnType<typeof setTimeout> | null = null;
  let floatingCleanup: (() => void) | null = null;

  const content = TooltipContent(contentId);

  function show(): void {
    if (showTimeout !== null) return;
    showTimeout = setTimeout(() => {
      state.open.value = true;
      setHidden(content, false);
      setDataState(content, 'open');

      if (positioning) {
        const effectivePlacement = positioning.placement ?? 'top';
        const result = createFloatingPosition(trigger, content, {
          ...positioning,
          placement: effectivePlacement,
        });
        floatingCleanup = result.cleanup;
      }

      onOpenChange?.(true);
      showTimeout = null;
    }, delay);
  }

  function hide(): void {
    if (showTimeout !== null) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    state.open.value = false;
    setDataState(content, 'closed');
    setHiddenAnimated(content, true);
    floatingCleanup?.();
    floatingCleanup = null;
    onOpenChange?.(false);
  }

  const trigger = TooltipTrigger(show, hide);
  setDescribedBy(trigger, contentId);

  applyAttrs(trigger, attrs);

  return { trigger, content, state };
}

export const Tooltip: {
  Root: (options?: TooltipOptions) => TooltipElements & { state: TooltipState };
} = {
  Root: TooltipRoot,
};
