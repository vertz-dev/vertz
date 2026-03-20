import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { focusFirst, setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface NavigationMenuOptions extends ElementAttrs {
  orientation?: 'horizontal' | 'vertical';
  delayOpen?: number;
  delayClose?: number;
}

export interface NavigationMenuState {
  activeItem: Signal<string | null>;
}

export interface NavigationMenuElements {
  root: HTMLElement;
  list: HTMLElement;
  viewport: HTMLElement;
}

function NavMenuList(triggers: HTMLElement[], orientation: 'horizontal' | 'vertical'): HTMLElement {
  return (
    <div
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
          handleListNavigation(event, triggers, {
            orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
          });
        }
      }}
    />
  ) as HTMLElement;
}

function NavMenuViewport(): HTMLElement {
  return (<div />) as HTMLElement;
}

function NavMenuNav(list: HTMLElement, viewport: HTMLElement): HTMLElement {
  return (
    <nav>
      {list}
      {viewport}
    </nav>
  ) as HTMLElement;
}

function NavMenuItemTrigger(
  triggerId: string,
  contentId: string,
  value: string,
  label: string | undefined,
  onClick: () => void,
  onMouseenter: () => void,
  onMouseleave: () => void,
  onKeydown: (event: KeyboardEvent) => void,
): HTMLElement {
  return (
    <button
      type="button"
      id={triggerId}
      aria-controls={contentId}
      data-value={value}
      aria-expanded="false"
      data-state="closed"
      onClick={onClick}
      onMouseenter={onMouseenter}
      onMouseleave={onMouseleave}
      onKeydown={onKeydown}
    >
      {label ?? value}
    </button>
  ) as HTMLElement;
}

function NavMenuItemContent(
  contentId: string,
  onMouseenter: () => void,
  onMouseleave: () => void,
  onKeydown: (event: KeyboardEvent) => void,
): HTMLElement {
  return (
    <div
      id={contentId}
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      onMouseenter={onMouseenter}
      onMouseleave={onMouseleave}
      onKeydown={onKeydown}
    />
  ) as HTMLElement;
}

function NavMenuLink(href: string, label: string): HTMLElement {
  return (<a href={href}>{label}</a>) as HTMLElement;
}

function NavigationMenuRoot(options: NavigationMenuOptions = {}): NavigationMenuElements & {
  state: NavigationMenuState;
  Item: (
    value: string,
    label?: string,
  ) => {
    trigger: HTMLElement;
    content: HTMLElement;
  };
  Link: (href: string, label: string) => HTMLElement;
} {
  const { orientation = 'horizontal', delayOpen = 200, delayClose = 300, ...attrs } = options;
  const state: NavigationMenuState = { activeItem: signal<string | null>(null) };
  const triggers: HTMLElement[] = [];
  const items: Map<string, { trigger: HTMLElement; content: HTMLElement }> = new Map();
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

  const list = NavMenuList(triggers, orientation);
  const viewport = NavMenuViewport();
  const root = NavMenuNav(list, viewport);

  function Item(
    value: string,
    label?: string,
  ): {
    trigger: HTMLElement;
    content: HTMLElement;
  } {
    const ids = linkedIds('nav-menu');
    let contentEl: HTMLElement;

    const trigger = NavMenuItemTrigger(
      ids.triggerId,
      ids.contentId,
      value,
      label,
      () => {
        if (state.activeItem.peek() === value) {
          closeAll();
        } else {
          openItem(value);
        }
      },
      () => {
        cancelTimers();
        openTimeout = setTimeout(() => {
          openItem(value);
          openTimeout = null;
        }, delayOpen);
      },
      () => {
        cancelTimers();
        closeTimeout = setTimeout(() => {
          closeAll();
          closeTimeout = null;
        }, delayClose);
      },
      (event: KeyboardEvent) => {
        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          openItem(value);
          queueMicrotask(() => focusFirst(contentEl));
        }
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          closeAll();
        }
      },
    );

    contentEl = NavMenuItemContent(
      ids.contentId,
      () => cancelTimers(),
      () => {
        cancelTimers();
        closeTimeout = setTimeout(() => {
          closeAll();
          closeTimeout = null;
        }, delayClose);
      },
      (event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          closeAll();
          trigger.focus();
        }
      },
    );

    triggers.push(trigger);
    setRovingTabindex(triggers, 0);
    items.set(value, { trigger, content: contentEl });
    list.appendChild(trigger);
    viewport.appendChild(contentEl);

    return { trigger, content: contentEl };
  }

  function Link(href: string, label: string): HTMLElement {
    const a = NavMenuLink(href, label);
    list.appendChild(a);
    return a;
  }

  applyAttrs(root, attrs);

  return { root, list, viewport, state, Item, Link };
}

export const NavigationMenu: {
  Root: (options?: NavigationMenuOptions) => NavigationMenuElements & {
    state: NavigationMenuState;
    Item: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLElement;
      content: HTMLElement;
    };
    Link: (href: string, label: string) => HTMLElement;
  };
} = {
  Root: NavigationMenuRoot,
};
