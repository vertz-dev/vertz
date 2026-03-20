/**
 * Popover primitive - positioned popover with focus management.
 * Follows WAI-ARIA disclosure pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { focusFirst, saveFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface PopoverOptions extends ElementAttrs {
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

function PopoverRoot(options: PopoverOptions = {}): PopoverElements & { state: PopoverState } {
  const { defaultOpen = false, onOpenChange, positioning, ...attrs } = options;
  const ids = linkedIds('popover');
  const state: PopoverState = { open: signal(defaultOpen) };
  let restoreFocus: (() => void) | null = null;
  let floatingCleanup: (() => void) | null = null;
  let dismissCleanup: (() => void) | null = null;

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
        escapeKey: false,
      });
    }

    onOpenChange?.(true);
  }

  function close(): void {
    state.open.value = false;
    setExpanded(trigger, false);
    setDataState(trigger, 'closed');
    setDataState(content, 'closed');
    setHiddenAnimated(content, true);
    floatingCleanup?.();
    floatingCleanup = null;
    dismissCleanup?.();
    dismissCleanup = null;
    restoreFocus?.();
    restoreFocus = null;
    onOpenChange?.(false);
  }

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-haspopup="dialog"
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      onClick={() => {
        if (state.open.peek()) {
          close();
        } else {
          open();
        }
      }}
    />
  ) as HTMLButtonElement;

  const content = (
    <div
      role="dialog"
      id={ids.contentId}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={{ display: defaultOpen ? '' : 'none' }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          close();
        }
      }}
    />
  ) as HTMLDivElement;

  applyAttrs(trigger, attrs);

  return { trigger, content, state };
}

export const Popover: {
  Root: (options?: PopoverOptions) => PopoverElements & { state: PopoverState };
} = {
  Root: PopoverRoot,
};
