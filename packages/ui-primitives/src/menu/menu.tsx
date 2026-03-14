/**
 * Menu primitive - menubar/menuitem with arrow key navigation.
 * Follows WAI-ARIA menu pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface MenuOptions extends ElementAttrs {
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export interface MenuState {
  open: Signal<boolean>;
  activeIndex: Signal<number>;
}

export interface MenuElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}

function MenuRoot(options: MenuOptions = {}): MenuElements & {
  state: MenuState;
  Item: (value: string, label?: string) => HTMLDivElement;
  Group: (label: string) => {
    el: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
  Separator: () => HTMLHRElement;
  Label: (text: string) => HTMLDivElement;
} {
  const { onSelect, positioning, ...attrs } = options;
  const ids = linkedIds('menu');
  const state: MenuState = {
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

  function open(activateFirst = false): void {
    state.open.value = true;
    setExpanded(trigger, true);
    setHidden(content, false);
    setDataState(trigger, 'open');
    setDataState(content, 'open');

    if (positioning) {
      const ref = positioning.referenceElement ?? trigger;
      const result = createFloatingPosition(ref, content, positioning);
      floatingCleanup = result.cleanup;
      dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [ref, trigger, content],
        escapeKey: false,
      });
    } else {
      document.addEventListener('mousedown', handleClickOutside);
    }

    if (activateFirst && items.length > 0) {
      state.activeIndex.value = 0;
      updateActiveItem(0);
      items[0]?.focus();
    } else {
      state.activeIndex.value = -1;
      updateActiveItem(-1);
      content.focus();
    }
  }

  function close(): void {
    state.open.value = false;
    setExpanded(trigger, false);
    setDataState(trigger, 'closed');
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
    trigger.focus();
  }

  function updateActiveItem(index: number): void {
    for (let i = 0; i < items.length; i++) {
      items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
    }
  }

  const trigger = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-haspopup="menu"
      aria-expanded="false"
      data-state="closed"
      onClick={() => {
        if (state.open.peek()) {
          close();
        } else {
          open();
        }
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!state.open.peek()) open(true);
        }
      }}
    />
  ) as HTMLButtonElement;

  const content = (
    <div
      role="menu"
      tabindex="-1"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
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

        if (state.activeIndex.peek() === -1) {
          if (isKey(event, Keys.ArrowDown)) {
            event.preventDefault();
            state.activeIndex.value = 0;
            updateActiveItem(0);
            items[0]?.focus();
            return;
          }
          if (isKey(event, Keys.ArrowUp)) {
            event.preventDefault();
            const last = items.length - 1;
            state.activeIndex.value = last;
            updateActiveItem(last);
            items[last]?.focus();
            return;
          }
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

export const Menu: {
  Root: (options?: MenuOptions) => MenuElements & {
    state: MenuState;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
    Label: (text: string) => HTMLDivElement;
  };
} = {
  Root: MenuRoot,
};
