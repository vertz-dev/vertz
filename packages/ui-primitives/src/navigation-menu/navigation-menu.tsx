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

function NavigationMenuRoot(options: NavigationMenuOptions = {}): NavigationMenuElements & {
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

  const list = (
    <div
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
          handleListNavigation(event, triggers, {
            orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
          });
        }
      }}
    />
  ) as HTMLDivElement;

  const viewport = (<div />) as HTMLDivElement;

  const root = (
    <nav>
      {list}
      {viewport}
    </nav>
  ) as HTMLElement;

  function Item(
    value: string,
    label?: string,
  ): {
    trigger: HTMLButtonElement;
    content: HTMLDivElement;
  } {
    const ids = linkedIds('nav-menu');

    const trigger = (
      <button
        type="button"
        id={ids.triggerId}
        aria-controls={ids.contentId}
        data-value={value}
        aria-expanded="false"
        data-state="closed"
        onClick={() => {
          if (state.activeItem.peek() === value) {
            closeAll();
          } else {
            openItem(value);
          }
        }}
        onMouseenter={() => {
          cancelTimers();
          openTimeout = setTimeout(() => {
            openItem(value);
            openTimeout = null;
          }, delayOpen);
        }}
        onMouseleave={() => {
          cancelTimers();
          closeTimeout = setTimeout(() => {
            closeAll();
            closeTimeout = null;
          }, delayClose);
        }}
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.Enter, Keys.Space)) {
            event.preventDefault();
            openItem(value);
            queueMicrotask(() => focusFirst(content));
          }
          if (isKey(event, Keys.Escape)) {
            event.preventDefault();
            closeAll();
          }
        }}
      >
        {label ?? value}
      </button>
    ) as HTMLButtonElement;

    const content = (
      <div
        id={ids.contentId}
        aria-hidden="true"
        data-state="closed"
        style="display: none"
        onMouseenter={() => cancelTimers()}
        onMouseleave={() => {
          cancelTimers();
          closeTimeout = setTimeout(() => {
            closeAll();
            closeTimeout = null;
          }, delayClose);
        }}
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.Escape)) {
            event.preventDefault();
            event.stopPropagation();
            closeAll();
            trigger.focus();
          }
        }}
      />
    ) as HTMLDivElement;

    triggers.push(trigger);
    setRovingTabindex(triggers, 0);
    items.set(value, { trigger, content });
    list.appendChild(trigger);
    viewport.appendChild(content);

    return { trigger, content };
  }

  function Link(href: string, label: string): HTMLAnchorElement {
    const a = (<a href={href}>{label}</a>) as HTMLAnchorElement;
    list.appendChild(a);
    return a;
  }

  return { root, list, viewport, state, Item, Link };
}

export const NavigationMenu: {
  Root: (options?: NavigationMenuOptions) => NavigationMenuElements & {
    state: NavigationMenuState;
    Item: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    };
    Link: (href: string, label: string) => HTMLAnchorElement;
  };
} = {
  Root: NavigationMenuRoot,
};
