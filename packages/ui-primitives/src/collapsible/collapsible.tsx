/**
 * Collapsible primitive - expandable/collapsible content.
 * Follows WAI-ARIA disclosure pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { linkedIds } from '../utils/id';

export interface CollapsibleOptions extends ElementAttrs {
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

function CollapsibleRoot(options: CollapsibleOptions = {}) {
  const { defaultOpen = false, disabled = false, onOpenChange, ...attrs } = options;
  const ids = linkedIds('collapsible');
  const state: CollapsibleState = {
    open: signal(defaultOpen),
    disabled: signal(disabled),
  };

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

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={toggle}
    />
  ) as HTMLButtonElement;

  const content = (
    <div
      id={ids.contentId}
      aria-hidden={defaultOpen ? 'false' : 'true'}
      data-state={defaultOpen ? 'open' : 'closed'}
      style={defaultOpen ? '' : 'display: none'}
    />
  ) as HTMLDivElement;

  const root = (
    <div>
      {trigger}
      {content}
    </div>
  ) as HTMLDivElement;

  applyAttrs(root, attrs);

  return { root, trigger, content, state };
}

export const Collapsible: {
  Root: (options?: CollapsibleOptions) => CollapsibleElements & { state: CollapsibleState };
} = {
  Root: CollapsibleRoot,
};
