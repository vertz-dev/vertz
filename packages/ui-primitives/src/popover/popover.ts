/**
 * Popover primitive - positioned popover with focus management.
 * Follows WAI-ARIA disclosure pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { focusFirst, saveFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface PopoverOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
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
    const { defaultOpen = false, onOpenChange, positioning } = options;
    const ids = linkedIds('popover');
    const state: PopoverState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;
    let floatingCleanup: (() => void) | null = null;
    let dismissCleanup: (() => void) | null = null;

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

      if (positioning) {
        const result = createFloatingPosition(trigger, content, positioning);
        floatingCleanup = result.cleanup;
        dismissCleanup = createDismiss({
          onDismiss: close,
          insideElements: [trigger, content],
          escapeKey: false, // Escape already handled by content keydown
        });
      }

      onOpenChange?.(true);
    }

    function close(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');
      // Defer display:none until exit animations complete
      setHiddenAnimated(content, true);
      floatingCleanup?.();
      floatingCleanup = null;
      dismissCleanup?.();
      dismissCleanup = null;
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
