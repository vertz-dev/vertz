import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { focusFirst, setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface NavigationMenuOptions {
  orientation?: 'horizontal' | 'vertical';
  delayOpen?: number;
  delayClose?: number;
}

export interface NavigationMenuState {
  activeItem: Signal<string | null>;
}

export interface NavigationMenuElements {
  root: HTMLElement;
  list: HTMLDivElement;
  viewport: HTMLDivElement;
}

export const NavigationMenu = {
  Root(options: NavigationMenuOptions = {}): NavigationMenuElements & {
    state: NavigationMenuState;
    Item: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    };
    Link: (href: string, label: string) => HTMLAnchorElement;
  } {
    const { orientation = 'horizontal', delayOpen = 200, delayClose = 300 } = options;
    const state: NavigationMenuState = { activeItem: signal<string | null>(null) };
    const triggers: HTMLButtonElement[] = [];
    const items: Map<string, { trigger: HTMLButtonElement; content: HTMLDivElement }> = new Map();
    let openTimeout: ReturnType<typeof setTimeout> | null = null;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const root = document.createElement('nav');

    const list = document.createElement('div');

    const viewport = document.createElement('div');

    function cancelTimers(): void {
      if (openTimeout) {
        clearTimeout(openTimeout);
        openTimeout = null;
      }
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    }

    function openItem(value: string): void {
      cancelTimers();
      const current = state.activeItem.peek();
      if (current && current !== value) {
        const prev = items.get(current);
        if (prev) {
          setExpanded(prev.trigger, false);
          setDataState(prev.trigger, 'closed');
          setDataState(prev.content, 'closed');
          setHiddenAnimated(prev.content, true);
        }
      }
      const item = items.get(value);
      if (!item) return;
      state.activeItem.value = value;
      setExpanded(item.trigger, true);
      setHidden(item.content, false);
      setDataState(item.trigger, 'open');
      setDataState(item.content, 'open');
    }

    function closeAll(): void {
      cancelTimers();
      const current = state.activeItem.peek();
      if (current) {
        const item = items.get(current);
        if (item) {
          setExpanded(item.trigger, false);
          setDataState(item.trigger, 'closed');
          setDataState(item.content, 'closed');
          setHiddenAnimated(item.content, true);
        }
      }
      state.activeItem.value = null;
    }

    function Item(
      value: string,
      label?: string,
    ): {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    } {
      const ids = linkedIds('nav-menu');

      const trigger = document.createElement('button');
      trigger.setAttribute('type', 'button');
      trigger.id = ids.triggerId;
      trigger.setAttribute('aria-controls', ids.contentId);
      trigger.setAttribute('data-value', value);
      trigger.textContent = label ?? value;
      setExpanded(trigger, false);
      setDataState(trigger, 'closed');

      const content = document.createElement('div');
      content.id = ids.contentId;
      setHidden(content, true);
      setDataState(content, 'closed');

      // Click toggle
      trigger.addEventListener('click', () => {
        if (state.activeItem.peek() === value) {
          closeAll();
        } else {
          openItem(value);
        }
      });

      // Hover intent on trigger
      trigger.addEventListener('mouseenter', () => {
        cancelTimers();
        openTimeout = setTimeout(() => {
          openItem(value);
          openTimeout = null;
        }, delayOpen);
      });

      trigger.addEventListener('mouseleave', () => {
        cancelTimers();
        closeTimeout = setTimeout(() => {
          closeAll();
          closeTimeout = null;
        }, delayClose);
      });

      // Content hover cancels close
      content.addEventListener('mouseenter', () => {
        cancelTimers();
      });

      content.addEventListener('mouseleave', () => {
        cancelTimers();
        closeTimeout = setTimeout(() => {
          closeAll();
          closeTimeout = null;
        }, delayClose);
      });

      // Keyboard
      trigger.addEventListener('keydown', (event) => {
        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          openItem(value);
          queueMicrotask(() => focusFirst(content));
        }
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          closeAll();
        }
      });

      content.addEventListener('keydown', (event) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          closeAll();
          trigger.focus();
        }
      });

      triggers.push(trigger);
      setRovingTabindex(triggers, 0);
      items.set(value, { trigger, content });
      list.appendChild(trigger);
      viewport.appendChild(content);

      return { trigger, content };
    }

    function Link(href: string, label: string): HTMLAnchorElement {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      list.appendChild(a);
      return a;
    }

    // List-level keyboard navigation between triggers
    list.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
        handleListNavigation(event, triggers, {
          orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
        });
      }
    });

    root.appendChild(list);
    root.appendChild(viewport);

    return { root, list, viewport, state, Item, Link };
  },
};
