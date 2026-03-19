/**
 * Composed NavigationMenu — compound component with hover-triggered dropdowns.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Triggers and content panels are discovered from the DOM via querySelectorAll.
 * No registration phase, no resolveChildren, no internal API imports.
 *
 * Follows WAI-ARIA navigation menu pattern with keyboard navigation,
 * hover delays, and roving tabindex.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

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
// Context
// ---------------------------------------------------------------------------

interface NavigationMenuContextValue {
  rootId: string;
  rootRef: Ref<HTMLElement>;
  classes?: NavigationMenuClasses;
  orientation: 'horizontal' | 'vertical';
  getActiveItem: () => string | null;
  openItem: (value: string) => void;
  closeAll: () => void;
  scheduleOpen: (value: string) => void;
  scheduleClose: () => void;
  cancelTimers: () => void;
}

interface NavigationMenuItemContextValue {
  value: string;
  triggerId: string;
  contentId: string;
  triggerRef: Ref<HTMLButtonElement>;
  contentRef: Ref<HTMLDivElement>;
}

const NavigationMenuContext = createContext<NavigationMenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::NavigationMenuContext',
);

const NavigationMenuListContext = createContext<undefined>(
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

function useNavigationMenuListContext(componentName: string): void {
  const ctx = useContext(NavigationMenuListContext);
  if (ctx === undefined && !useContext(NavigationMenuContext)) {
    throw new Error(
      `<NavigationMenu.${componentName}> must be used inside <NavigationMenu.List>. ` +
        'Ensure it is a direct or nested child of the NavigationMenu.List component.',
    );
  }
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function NavMenuList({ children, className: cls, class: classProp }: ListProps) {
  const ctx = useNavigationMenuContext('List');
  const effectiveCls = cls ?? classProp;
  const listClass = [ctx.classes?.list, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      data-part="nav-list"
      data-navmenu-list=""
      class={listClass || undefined}
      onKeydown={(event: KeyboardEvent) => {
        if (!isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) return;

        const listEl = event.currentTarget as HTMLElement;
        const currentTriggers = [
          ...listEl.querySelectorAll<HTMLButtonElement>('[data-navmenu-trigger]'),
        ];
        const focused = document.activeElement as HTMLElement;
        const currentIndex = currentTriggers.indexOf(focused as HTMLButtonElement);
        if (currentIndex < 0) return;

        let nextIndex = -1;
        if (isKey(event, Keys.ArrowRight)) {
          event.preventDefault();
          nextIndex = (currentIndex + 1) % currentTriggers.length;
        } else if (isKey(event, Keys.ArrowLeft)) {
          event.preventDefault();
          nextIndex = (currentIndex - 1 + currentTriggers.length) % currentTriggers.length;
        } else if (isKey(event, Keys.Home)) {
          event.preventDefault();
          nextIndex = 0;
        } else if (isKey(event, Keys.End)) {
          event.preventDefault();
          nextIndex = currentTriggers.length - 1;
        }

        const nextTrigger = currentTriggers[nextIndex];
        if (nextTrigger) {
          for (let i = 0; i < currentTriggers.length; i++) {
            currentTriggers[i]?.setAttribute('tabindex', i === nextIndex ? '0' : '-1');
          }
          nextTrigger.focus();
        }
      }}
    >
      {children}
    </div>
  );
}

function NavMenuItem({ value, children }: ItemProps) {
  useNavigationMenuListContext('Item');
  const ids = linkedIds('nav-menu');
  const triggerRef: Ref<HTMLButtonElement> = ref();
  const contentRef: Ref<HTMLDivElement> = ref();

  const itemCtx: NavigationMenuItemContextValue = {
    value,
    triggerId: ids.triggerId,
    contentId: ids.contentId,
    triggerRef,
    contentRef,
  };

  return (
    <NavigationMenuItemContext.Provider value={itemCtx}>
      <span style="display: contents" data-navmenu-item="" data-value={value}>
        {children}
      </span>
    </NavigationMenuItemContext.Provider>
  );
}

function NavMenuTrigger({ children, className: cls, class: classProp }: TriggerProps) {
  const ctx = useNavigationMenuContext('Trigger');
  const itemCtx = useNavigationMenuItemContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const triggerClass = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');

  return (
    <button
      ref={itemCtx.triggerRef}
      type="button"
      id={itemCtx.triggerId}
      aria-controls={itemCtx.contentId}
      data-navmenu-trigger=""
      data-value={itemCtx.value}
      aria-expanded="false"
      data-state="closed"
      class={triggerClass || undefined}
      onClick={() => {
        if (ctx.getActiveItem() === itemCtx.value) {
          ctx.closeAll();
        } else {
          ctx.openItem(itemCtx.value);
        }
      }}
      onMouseenter={() => {
        ctx.cancelTimers();
        ctx.scheduleOpen(itemCtx.value);
      }}
      onMouseleave={() => {
        ctx.cancelTimers();
        ctx.scheduleClose();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          ctx.openItem(itemCtx.value);
          // Focus first focusable in content
          queueMicrotask(() => {
            const content = itemCtx.contentRef.current;
            if (content) {
              const first = content.querySelector<HTMLElement>('a, button, [tabindex]');
              if (first) first.focus();
            }
          });
        }
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          ctx.closeAll();
        }
      }}
    >
      {children}
    </button>
  );
}

function NavMenuContent({ children, className: cls, class: classProp }: ContentProps) {
  const ctx = useNavigationMenuContext('Content');
  const itemCtx = useNavigationMenuItemContext('Content');
  const effectiveCls = cls ?? classProp;
  const contentClass = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      ref={itemCtx.contentRef}
      id={itemCtx.contentId}
      data-part="nav-content"
      data-navmenu-content=""
      data-value={itemCtx.value}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={contentClass || undefined}
      onMouseenter={() => ctx.cancelTimers()}
      onMouseleave={() => {
        ctx.cancelTimers();
        ctx.scheduleClose();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          ctx.closeAll();
          // Return focus to the associated trigger
          const trigger = itemCtx.triggerRef.current;
          if (trigger) trigger.focus();
        }
      }}
    >
      {children}
    </div>
  );
}

function NavMenuLink({ href, children, className: cls, class: classProp }: LinkProps) {
  const ctx = useNavigationMenuContext('Link');
  useNavigationMenuListContext('Link');
  const effectiveCls = cls ?? classProp;
  const linkClass = [ctx.classes?.link, effectiveCls].filter(Boolean).join(' ');

  return (
    <a href={href} data-navmenu-link="" class={linkClass || undefined}>
      {children}
    </a>
  );
}

function NavMenuViewport({ className: cls, class: classProp }: ViewportProps) {
  const ctx = useNavigationMenuContext('Viewport');
  const effectiveCls = cls ?? classProp;
  const viewportClass = [ctx.classes?.viewport, effectiveCls].filter(Boolean).join(' ');

  return (
    <div data-part="nav-viewport" data-navmenu-viewport="" class={viewportClass || undefined} />
  );
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
  const rootId = `nav-menu-${linkedIds('nav-root').triggerId}`;
  const rootRef: Ref<HTMLElement> = ref();

  // Mutable state for active item and timers.
  const state: {
    activeItem: string | null;
    openTimeout: ReturnType<typeof setTimeout> | null;
    closeTimeout: ReturnType<typeof setTimeout> | null;
  } = { activeItem: null, openTimeout: null, closeTimeout: null };

  function cancelTimers(): void {
    if (state.openTimeout) {
      clearTimeout(state.openTimeout);
      state.openTimeout = null;
    }
    if (state.closeTimeout) {
      clearTimeout(state.closeTimeout);
      state.closeTimeout = null;
    }
  }

  function getRootEl(): HTMLElement | null {
    return rootRef.current ?? null;
  }

  function openItem(value: string): void {
    cancelTimers();
    const root = getRootEl();
    if (!root) return;

    // Close previous
    if (state.activeItem && state.activeItem !== value) {
      const prevTrigger = root.querySelector<HTMLElement>(
        `[data-navmenu-trigger][data-value="${state.activeItem}"]`,
      );
      const prevContent = root.querySelector<HTMLElement>(
        `[data-navmenu-content][data-value="${state.activeItem}"]`,
      );
      if (prevTrigger) {
        prevTrigger.setAttribute('aria-expanded', 'false');
        prevTrigger.setAttribute('data-state', 'closed');
      }
      if (prevContent) {
        prevContent.setAttribute('data-state', 'closed');
        prevContent.setAttribute('aria-hidden', 'true');
        prevContent.style.display = 'none';
      }
    }

    // Open new
    const trigger = root.querySelector<HTMLElement>(
      `[data-navmenu-trigger][data-value="${value}"]`,
    );
    const content = root.querySelector<HTMLElement>(
      `[data-navmenu-content][data-value="${value}"]`,
    );
    if (!trigger || !content) return;

    state.activeItem = value;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('data-state', 'open');
    content.setAttribute('aria-hidden', 'false');
    content.setAttribute('data-state', 'open');
    content.style.display = '';

    // Move content into viewport if one exists
    const viewport = root.querySelector<HTMLElement>('[data-navmenu-viewport]');
    if (viewport && content.parentElement !== viewport) {
      viewport.appendChild(content);
    }
  }

  function closeAll(): void {
    cancelTimers();
    const root = getRootEl();
    if (!root || !state.activeItem) return;

    const trigger = root.querySelector<HTMLElement>(
      `[data-navmenu-trigger][data-value="${state.activeItem}"]`,
    );
    const content = root.querySelector<HTMLElement>(
      `[data-navmenu-content][data-value="${state.activeItem}"]`,
    );
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('data-state', 'closed');
    }
    if (content) {
      content.setAttribute('data-state', 'closed');
      content.setAttribute('aria-hidden', 'true');
      content.style.display = 'none';
    }
    state.activeItem = null;
  }

  function scheduleOpen(value: string): void {
    state.openTimeout = setTimeout(() => {
      openItem(value);
      state.openTimeout = null;
    }, delayOpen);
  }

  function scheduleClose(): void {
    state.closeTimeout = setTimeout(() => {
      closeAll();
      state.closeTimeout = null;
    }, delayClose);
  }

  const ctx: NavigationMenuContextValue = {
    rootId,
    rootRef,
    classes,
    orientation,
    getActiveItem: () => state.activeItem,
    openItem,
    closeAll,
    scheduleOpen,
    scheduleClose,
    cancelTimers,
  };

  return (
    <NavigationMenuContext.Provider value={ctx}>
      <nav ref={rootRef} id={rootId} class={classes?.root || undefined}>
        {children}
      </nav>
    </NavigationMenuContext.Provider>
  );
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
