/**
 * Composed NavigationMenu — fully declarative JSX component with hover-triggered
 * dropdowns. Sub-components self-wire via context. No factory wrapping.
 *
 * Follows WAI-ARIA navigation menu pattern with keyboard navigation,
 * hover delays, and roving tabindex.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { focusFirst, setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface NavigationMenuClasses {
  root?: string;
  list?: string;
  trigger?: string;
  content?: string;
  link?: string;
  viewport?: string;
}

// ---------------------------------------------------------------------------
// Registration types
// ---------------------------------------------------------------------------

interface ItemRegistration {
  value: string;
  triggerChildren: ChildValue;
  contentChildren: ChildValue;
  triggerClassName: string | undefined;
  contentClassName: string | undefined;
}

interface LinkRegistration {
  href: string;
  children: ChildValue;
  className: string | undefined;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface NavigationMenuContextValue {
  classes?: NavigationMenuClasses;
  orientation: 'horizontal' | 'vertical';
  _registerList: (listChildren: ChildValue) => void;
  _registerViewport: () => void;
  _listClaimed: boolean;
  _viewportClaimed: boolean;
}

interface NavigationMenuListContextValue {
  classes?: NavigationMenuClasses;
  _registerItem: (reg: ItemRegistration) => void;
  _registerLink: (reg: LinkRegistration) => void;
}

interface NavigationMenuItemContextValue {
  value: string;
  _registerTrigger: (children: ChildValue, className?: string) => void;
  _registerContent: (children: ChildValue, className?: string) => void;
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const NavigationMenuContext = createContext<NavigationMenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::NavigationMenuContext',
);

const NavigationMenuListContext = createContext<NavigationMenuListContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::NavigationMenuListContext',
);

const NavigationMenuItemContext = createContext<NavigationMenuItemContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::NavigationMenuItemContext',
);

function useNavigationMenuContext(componentName: string): NavigationMenuContextValue {
  const ctx = useContext(NavigationMenuContext);
  if (!ctx) {
    throw new Error(
      `<NavigationMenu.${componentName}> must be used inside <NavigationMenu>. ` +
        'Ensure it is a direct or nested child of the NavigationMenu root component.',
    );
  }
  return ctx;
}

function useNavigationMenuListContext(componentName: string): NavigationMenuListContextValue {
  const ctx = useContext(NavigationMenuListContext);
  if (!ctx) {
    throw new Error(
      `<NavigationMenu.${componentName}> must be used inside <NavigationMenu.List>. ` +
        'Ensure it is a direct or nested child of the NavigationMenu.List component.',
    );
  }
  return ctx;
}

function useNavigationMenuItemContext(componentName: string): NavigationMenuItemContextValue {
  const ctx = useContext(NavigationMenuItemContext);
  if (!ctx) {
    throw new Error(
      `<NavigationMenu.${componentName}> must be used inside <NavigationMenu.Item>. ` +
        'Ensure it is a direct or nested child of the NavigationMenu.Item component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface ListProps {
  children?: ChildValue;
  className?: string;
  class?: string;
}

interface ItemProps {
  value: string;
  children?: ChildValue;
}

interface TriggerProps {
  children?: ChildValue;
  className?: string;
  class?: string;
}

interface ContentProps {
  children?: ChildValue;
  className?: string;
  class?: string;
}

interface LinkProps {
  href: string;
  children?: ChildValue;
  className?: string;
  class?: string;
}

interface ViewportProps {
  className?: string;
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function NavMenuList({ children }: ListProps) {
  const ctx = useNavigationMenuContext('List');
  if (ctx._listClaimed) {
    console.warn('Duplicate <NavigationMenu.List> detected – only the first is used');
  }
  ctx._listClaimed = true;
  ctx._registerList(children);
  return (<span style="display: contents" />) as HTMLElement;
}

function NavMenuItem({ value, children }: ItemProps) {
  const listCtx = useNavigationMenuListContext('Item');

  const reg: ItemRegistration = {
    value,
    triggerChildren: undefined,
    contentChildren: undefined,
    triggerClassName: undefined,
    contentClassName: undefined,
  };

  const itemCtxValue: NavigationMenuItemContextValue = {
    value,
    _registerTrigger: (triggerChildren, className) => {
      reg.triggerChildren = triggerChildren;
      reg.triggerClassName = className;
    },
    _registerContent: (contentChildren, className) => {
      reg.contentChildren = contentChildren;
      reg.contentClassName = className;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  NavigationMenuItemContext.Provider(itemCtxValue, () => {
    resolveChildren(children);
  });

  listCtx._registerItem(reg);

  return (<span style="display: contents" />) as HTMLElement;
}

function NavMenuTrigger({ children, className: cls, class: classProp }: TriggerProps) {
  const ctx = useNavigationMenuItemContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <NavigationMenu.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  ctx._registerTrigger(children, cls ?? classProp);
  return (<span style="display: contents" />) as HTMLElement;
}

function NavMenuContent({ children, className: cls, class: classProp }: ContentProps) {
  const ctx = useNavigationMenuItemContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <NavigationMenu.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  ctx._registerContent(children, cls ?? classProp);
  return (<span style="display: contents" />) as HTMLElement;
}

function NavMenuLink({ href, children, className: cls, class: classProp }: LinkProps) {
  const listCtx = useNavigationMenuListContext('Link');
  listCtx._registerLink({ href, children, className: cls ?? classProp });
  return (<span style="display: contents" />) as HTMLElement;
}

function NavMenuViewport(_props: ViewportProps) {
  const ctx = useNavigationMenuContext('Viewport');
  if (ctx._viewportClaimed) {
    console.warn('Duplicate <NavigationMenu.Viewport> detected – only the first is used');
  }
  ctx._viewportClaimed = true;
  ctx._registerViewport();
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedNavigationMenuProps {
  children?: ChildValue;
  classes?: NavigationMenuClasses;
  orientation?: 'horizontal' | 'vertical';
  delayOpen?: number;
  delayClose?: number;
}

export type NavigationMenuClassKey = keyof NavigationMenuClasses;

function ComposedNavigationMenuRoot({
  children,
  classes,
  orientation = 'horizontal',
  delayOpen = 200,
  delayClose = 300,
}: ComposedNavigationMenuProps) {
  // Registration storage
  const reg: {
    listChildren: ChildValue;
    hasViewport: boolean;
  } = { listChildren: undefined, hasViewport: false };

  const ctxValue: NavigationMenuContextValue = {
    classes,
    orientation,
    _registerList: (listChildren) => {
      reg.listChildren = listChildren;
    },
    _registerViewport: () => {
      reg.hasViewport = true;
    },
    _listClaimed: false,
    _viewportClaimed: false,
  };

  // Phase 1: resolve top-level children to collect List + Viewport registrations
  NavigationMenuContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Phase 2: resolve list children to collect items and links
  const itemRegs: ItemRegistration[] = [];
  const linkRegs: LinkRegistration[] = [];

  const listCtxValue: NavigationMenuListContextValue = {
    classes,
    _registerItem: (itemReg) => {
      itemRegs.push(itemReg);
    },
    _registerLink: (linkReg) => {
      linkRegs.push(linkReg);
    },
  };

  NavigationMenuContext.Provider(ctxValue, () => {
    NavigationMenuListContext.Provider(listCtxValue, () => {
      resolveChildren(reg.listChildren);
    });
  });

  // Phase 3: build the navigation menu
  const triggers: HTMLElement[] = [];
  const items: Map<string, { trigger: HTMLElement; content: HTMLElement }> = new Map();
  let activeItem: string | null = null;
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
    if (activeItem && activeItem !== value) {
      const prev = items.get(activeItem);
      if (prev) {
        setExpanded(prev.trigger, false);
        setDataState(prev.trigger, 'closed');
        setDataState(prev.content, 'closed');
        setHiddenAnimated(prev.content, true);
      }
    }
    const item = items.get(value);
    if (!item) return;
    activeItem = value;
    setExpanded(item.trigger, true);
    setHidden(item.content, false);
    setDataState(item.trigger, 'open');
    setDataState(item.content, 'open');
  }

  function closeAll(): void {
    cancelTimers();
    if (activeItem) {
      const item = items.get(activeItem);
      if (item) {
        setExpanded(item.trigger, false);
        setDataState(item.trigger, 'closed');
        setDataState(item.content, 'closed');
        setHiddenAnimated(item.content, true);
      }
    }
    activeItem = null;
  }

  // Build items
  const listElements: HTMLElement[] = [];
  const viewportElements: HTMLElement[] = [];

  for (const itemReg of itemRegs) {
    const ids = linkedIds('nav-menu');

    const triggerResolved = resolveChildren(itemReg.triggerChildren);
    const contentResolved = resolveChildren(itemReg.contentChildren);

    const triggerClass =
      [classes?.trigger, itemReg.triggerClassName].filter(Boolean).join(' ') || undefined;
    const contentClass =
      [classes?.content, itemReg.contentClassName].filter(Boolean).join(' ') || undefined;

    let contentEl: HTMLElement;

    const triggerEl = (
      <button
        type="button"
        id={ids.triggerId}
        aria-controls={ids.contentId}
        data-value={itemReg.value}
        aria-expanded="false"
        data-state="closed"
        class={triggerClass}
        onClick={() => {
          if (activeItem === itemReg.value) {
            closeAll();
          } else {
            openItem(itemReg.value);
          }
        }}
        onMouseenter={() => {
          cancelTimers();
          openTimeout = setTimeout(() => {
            openItem(itemReg.value);
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
            openItem(itemReg.value);
            queueMicrotask(() => focusFirst(contentEl));
          }
          if (isKey(event, Keys.Escape)) {
            event.preventDefault();
            closeAll();
          }
        }}
      >
        {...triggerResolved}
      </button>
    ) as HTMLElement;

    contentEl = (
      <div
        id={ids.contentId}
        data-part="nav-content"
        aria-hidden="true"
        data-state="closed"
        style="display: none"
        class={contentClass}
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
            triggerEl.focus();
          }
        }}
      >
        {...contentResolved}
      </div>
    ) as HTMLElement;

    triggers.push(triggerEl);
    items.set(itemReg.value, { trigger: triggerEl, content: contentEl });
    listElements.push(triggerEl);
    viewportElements.push(contentEl);
  }

  // Build links
  for (const linkReg of linkRegs) {
    const linkResolved = resolveChildren(linkReg.children);
    const linkClass = [classes?.link, linkReg.className].filter(Boolean).join(' ') || undefined;

    const linkEl = (
      <a href={linkReg.href} class={linkClass}>
        {...linkResolved}
      </a>
    ) as HTMLElement;

    listElements.push(linkEl);
  }

  // Set roving tabindex on triggers
  if (triggers.length > 0) {
    setRovingTabindex(triggers, 0);
  }

  // Build list element
  const listEl = (
    <div
      data-part="nav-list"
      class={classes?.list || undefined}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
          handleListNavigation(event, triggers, {
            orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
          });
        }
      }}
    >
      {...listElements}
    </div>
  ) as HTMLElement;

  // Build viewport element
  const viewportEl = (
    <div data-part="nav-viewport" class={classes?.viewport || undefined}>
      {...viewportElements}
    </div>
  ) as HTMLElement;

  return (
    <nav class={classes?.root || undefined}>
      {listEl}
      {viewportEl}
    </nav>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedNavigationMenu = Object.assign(ComposedNavigationMenuRoot, {
  List: NavMenuList,
  Item: NavMenuItem,
  Trigger: NavMenuTrigger,
  Content: NavMenuContent,
  Link: NavMenuLink,
  Viewport: NavMenuViewport,
}) as ((props: ComposedNavigationMenuProps) => HTMLElement) & {
  __classKeys?: NavigationMenuClassKey;
  List: (props: ListProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Trigger: (props: TriggerProps) => HTMLElement;
  Content: (props: ContentProps) => HTMLElement;
  Link: (props: LinkProps) => HTMLElement;
  Viewport: (props: ViewportProps) => HTMLElement;
};
