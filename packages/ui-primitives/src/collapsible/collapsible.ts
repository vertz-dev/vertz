import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { linkedIds } from '../utils/id';

export interface CollapsibleOptions {
  defaultOpen?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface CollapsibleState {
  open: Signal<boolean>;
  disabled: Signal<boolean>;
}

export interface CollapsibleElements {
  root: HTMLDivElement;
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}

export const Collapsible = {
  Root(options: CollapsibleOptions = {}): CollapsibleElements & { state: CollapsibleState } {
    const { defaultOpen = false, disabled = false, onOpenChange } = options;
    const ids = linkedIds('collapsible');
    const state: CollapsibleState = {
      open: signal(defaultOpen),
      disabled: signal(disabled),
    };

    const root = document.createElement('div');

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    if (disabled) {
      trigger.disabled = true;
      trigger.setAttribute('aria-disabled', 'true');
    }

    const content = document.createElement('div');
    content.id = ids.contentId;
    setHidden(content, !defaultOpen);
    setDataState(content, defaultOpen ? 'open' : 'closed');

    function toggle(): void {
      if (state.disabled.peek()) return;
      const next = !state.open.peek();
      state.open.value = next;

      if (next) {
        setHidden(content, false);
      }
      const height = content.scrollHeight;
      content.style.setProperty('--collapsible-content-height', `${height}px`);
      setExpanded(trigger, next);
      setDataState(trigger, next ? 'open' : 'closed');
      setDataState(content, next ? 'open' : 'closed');
      if (!next) {
        setHiddenAnimated(content, true);
      }
      onOpenChange?.(next);
    }

    trigger.addEventListener('click', toggle);

    root.appendChild(trigger);
    root.appendChild(content);

    return { root, trigger, content, state };
  },
};
