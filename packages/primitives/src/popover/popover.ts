/**
 * Popover primitive - positioned popover with focus management.
 * Follows WAI-ARIA disclosure pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden } from '../utils/aria';
import { focusFirst, saveFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface PopoverOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface PopoverState {
  open: Signal<boolean>;
}

export interface PopoverElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}

export const Popover = {
  Root(options: PopoverOptions = {}): PopoverElements & { state: PopoverState } {
    const { defaultOpen = false, onOpenChange } = options;
    const ids = linkedIds('popover');
    const state: PopoverState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    trigger.setAttribute('aria-haspopup', 'dialog');
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'dialog');
    content.id = ids.contentId;
    setHidden(content, !defaultOpen);
    setDataState(content, defaultOpen ? 'open' : 'closed');

    function open(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(content, 'open');
      restoreFocus = saveFocus();
      queueMicrotask(() => focusFirst(content));
      onOpenChange?.(true);
    }

    function close(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setHidden(content, true);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');
      restoreFocus?.();
      restoreFocus = null;
      onOpenChange?.(false);
    }

    trigger.addEventListener('click', () => {
      if (state.open.peek()) {
        close();
      } else {
        open();
      }
    });

    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        close();
      }
    });

    return { trigger, content, state };
  },
};
