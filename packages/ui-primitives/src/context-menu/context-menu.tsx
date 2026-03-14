/**
 * ContextMenu primitive - right-click context menu with keyboard navigation.
 * Follows WAI-ARIA menu pattern, triggered by contextmenu event.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition, virtualElement } from '../utils/floating';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface ContextMenuOptions extends ElementAttrs {
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export interface ContextMenuState {
  open: Signal<boolean>;
  activeIndex: Signal<number>;
}

export interface ContextMenuElements {
  trigger: HTMLDivElement;
  content: HTMLDivElement;
}

function ContextMenuRoot(options: ContextMenuOptions = {}): ContextMenuElements & {
  state: ContextMenuState;
  Item: (value: string, label?: string) => HTMLDivElement;
  Group: (label: string) => {
    el: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
  Separator: () => HTMLHRElement;
  Label: (text: string) => HTMLDivElement;
} {
  const { onSelect, positioning, ...attrs } = options;
  const state: ContextMenuState = {
    open: signal(false),
    activeIndex: signal(-1),
  };
  const items: HTMLDivElement[] = [];
  let floatingCleanup: (() => void) | null = null;
  let dismissCleanup: (() => void) | null = null;

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!trigger.contains(target) && !content.contains(target)) {
      close();
    }
  }

  function updateActiveItem(index: number): void {
    for (let i = 0; i < items.length; i++) {
      items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
    }
  }

  function openMenu(x: number, y: number): void {
    state.open.value = true;
    setHidden(content, false);
    setDataState(content, 'open');

    if (positioning) {
      const result = createFloatingPosition(virtualElement(x, y), content, {
        strategy: 'fixed',
        ...positioning,
      });
      floatingCleanup = result.cleanup;
      dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [trigger, content],
        escapeKey: false,
      });
    } else {
      content.style.left = `${x}px`;
      content.style.top = `${y}px`;
      document.addEventListener('mousedown', handleClickOutside);
    }

    state.activeIndex.value = 0;
    updateActiveItem(0);
    items[0]?.focus();
  }

  function close(): void {
    state.open.value = false;
    setDataState(content, 'closed');
    setHiddenAnimated(content, true);

    if (positioning) {
      floatingCleanup?.();
      floatingCleanup = null;
      dismissCleanup?.();
      dismissCleanup = null;
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }

  const trigger = (
    <div
      onContextmenu={(event: MouseEvent) => {
        event.preventDefault();
        if (state.open.peek()) {
          close();
        }
        openMenu(event.clientX, event.clientY);
      }}
    />
  ) as HTMLDivElement;

  const contentId = uniqueId('ctx-menu');

  const content = (
    <div
      role="menu"
      id={contentId}
      style="position: fixed; display: none;"
      aria-hidden="true"
      data-state="closed"
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          close();
          return;
        }

        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          const active = items[state.activeIndex.peek()];
          if (active) {
            const val = active.getAttribute('data-value');
            if (val !== null) {
              onSelect?.(val);
              close();
            }
          }
          return;
        }

        const result = handleListNavigation(event, items, { orientation: 'vertical' });
        if (result) {
          const idx = items.indexOf(result as HTMLDivElement);
          if (idx >= 0) {
            state.activeIndex.value = idx;
            updateActiveItem(idx);
          }
          return;
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const char = event.key.toLowerCase();
          const match = items.find((item) => item.textContent?.toLowerCase().startsWith(char));
          if (match) {
            const idx = items.indexOf(match);
            state.activeIndex.value = idx;
            updateActiveItem(idx);
            match.focus();
          }
        }
      }}
    />
  ) as HTMLDivElement;

  function createItem(value: string, label?: string, parent?: HTMLElement): HTMLDivElement {
    const item = (
      <div
        role="menuitem"
        data-value={value}
        tabindex="-1"
        onClick={() => {
          onSelect?.(value);
          close();
        }}
      >
        {label ?? value}
      </div>
    ) as HTMLDivElement;

    items.push(item);
    (parent ?? content).appendChild(item);
    return item;
  }

  function Item(value: string, label?: string): HTMLDivElement {
    return createItem(value, label);
  }

  function Group(label: string): {
    el: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
  } {
    const el = (<div role="group" aria-label={label} />) as HTMLDivElement;
    content.appendChild(el);
    return {
      el,
      Item: (value: string, itemLabel?: string) => createItem(value, itemLabel, el),
    };
  }

  function Separator(): HTMLHRElement {
    const hr = (<hr role="separator" />) as HTMLHRElement;
    content.appendChild(hr);
    return hr;
  }

  function Label(text: string): HTMLDivElement {
    const el = (<div role="none">{text}</div>) as HTMLDivElement;
    content.appendChild(el);
    return el;
  }

  applyAttrs(trigger, attrs);

  return { trigger, content, state, Item, Group, Separator, Label };
}

export const ContextMenu: {
  Root: (options?: ContextMenuOptions) => ContextMenuElements & {
    state: ContextMenuState;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
    Label: (text: string) => HTMLDivElement;
  };
} = {
  Root: ContextMenuRoot,
};
