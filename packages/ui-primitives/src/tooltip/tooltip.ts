/**
 * Tooltip primitive - accessible tooltip with delay and aria-describedby.
 * Follows WAI-ARIA tooltip pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setDescribedBy, setHidden, setHiddenAnimated } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface TooltipOptions {
  delay?: number;
  onOpenChange?: (open: boolean) => void;
}

export interface TooltipState {
  open: Signal<boolean>;
}

export interface TooltipElements {
  trigger: HTMLElement;
  content: HTMLDivElement;
}

export const Tooltip = {
  Root(options: TooltipOptions = {}): TooltipElements & { state: TooltipState } {
    const { delay = 300, onOpenChange } = options;
    const contentId = uniqueId('tooltip');
    const state: TooltipState = { open: signal(false) };
    let showTimeout: ReturnType<typeof setTimeout> | null = null;

    const trigger = document.createElement('span');
    setDescribedBy(trigger, contentId);

    const content = document.createElement('div');
    content.setAttribute('role', 'tooltip');
    content.id = contentId;
    setHidden(content, true);
    setDataState(content, 'closed');

    function show(): void {
      if (showTimeout !== null) return;
      showTimeout = setTimeout(() => {
        state.open.value = true;
        setHidden(content, false);
        setDataState(content, 'open');
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
      // Defer display:none until exit animations complete
      setHiddenAnimated(content, true);
      onOpenChange?.(false);
    }

    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', hide);

    trigger.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        hide();
      }
    });

    return { trigger, content, state };
  },
};
