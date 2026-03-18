/**
 * Composed Menubar — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Triggers and content panels are discovered from the DOM via querySelectorAll.
 * No registration phase, no resolveChildren, no internal API imports.
 *
 * Follows WAI-ARIA menubar pattern with cross-menu keyboard navigation.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds, uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface MenubarClasses {
  root?: string;
  trigger?: string;
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

interface MenubarContextValue {
  rootId: string;
  classes?: MenubarClasses;
  getOnSelect: () => ((value: string) => void) | undefined;
  getPositioning: () => FloatingOptions | undefined;
  getActiveMenu: () => string | null;
  openMenu: (value: string) => void;
  closeAll: () => void;
}

const MenubarContext = createContext<MenubarContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::MenubarContext',
);

function useMenubarContext(componentName: string): MenubarContextValue {
  const ctx = useContext(MenubarContext);
  if (!ctx) {
    throw new Error(
      `<Menubar.${componentName}> must be used inside <Menubar>. ` +
        'Ensure it is a direct or nested child of the Menubar root component.',
    );
  }
  return ctx;
}

interface MenuContextValue {
  menuValue: string;
  triggerId: string;
  contentId: string;
  classes?: MenubarClasses;
}

const MenuContext = createContext<MenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::MenubarMenuContext',
);

function useMenuContext(componentName: string): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error(
      `<Menubar.${componentName}> must be used inside <Menubar.Menu>. ` +
        'Ensure it is a direct or nested child of a Menubar.Menu component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface MenuProps extends SlotProps {
  value: string;
}

interface ItemProps extends SlotProps {
  value: string;
}

interface GroupProps extends SlotProps {
  label: string;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function MenubarMenu({ value, children }: MenuProps) {
  const barCtx = useMenubarContext('Menu');
  const ids = linkedIds('menubar-menu');

  const menuCtx: MenuContextValue = {
    menuValue: value,
    triggerId: ids.triggerId,
    contentId: ids.contentId,
    classes: barCtx.classes,
  };

  return (
    <MenuContext.Provider value={menuCtx}>
      <span style="display: contents" data-menubar-menu="" data-value={value}>
        {children}
      </span>
    </MenuContext.Provider>
  );
}

function MenubarTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const barCtx = useMenubarContext('Trigger');
  const menuCtx = useMenuContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const triggerClass = [menuCtx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="menuitem"
      id={menuCtx.triggerId}
      aria-controls={menuCtx.contentId}
      aria-haspopup="menu"
      data-menubar-trigger=""
      data-value={menuCtx.menuValue}
      aria-expanded="false"
      data-state="closed"
      class={triggerClass || undefined}
      onClick={() => {
        if (barCtx.getActiveMenu() === menuCtx.menuValue) {
          barCtx.closeAll();
        } else {
          barCtx.openMenu(menuCtx.menuValue);
        }
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          barCtx.openMenu(menuCtx.menuValue);
        }
      }}
    >
      {children ?? menuCtx.menuValue}
    </button>
  );
}

function MenubarContent({ children, className: cls, class: classProp }: SlotProps) {
  const menuCtx = useMenuContext('Content');
  const effectiveCls = cls ?? classProp;
  const contentClass = [menuCtx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="menu"
      id={menuCtx.contentId}
      data-menubar-content=""
      data-value={menuCtx.menuValue}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={contentClass || undefined}
    >
      {children}
    </div>
  );
}

function MenubarItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const barCtx = useMenubarContext('Item');
  const menuCtx = useMenuContext('Item');
  const effectiveCls = cls ?? classProp;
  const itemClass = [menuCtx.classes?.item, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="menuitem"
      data-menubar-item=""
      data-value={value}
      tabindex="-1"
      class={itemClass || undefined}
      onClick={() => {
        barCtx.getOnSelect()?.(value);
        barCtx.closeAll();
      }}
    >
      {children}
    </div>
  );
}

function MenubarGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const menuCtx = useMenuContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [menuCtx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {children}
    </div>
  );
}

function MenubarLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Label');
  const effectiveCls = cls ?? classProp;
  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  );
}

function MenubarSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return <hr role="separator" class={sepClass || undefined} />;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedMenubarProps {
  children?: ChildValue;
  classes?: MenubarClasses;
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export type MenubarClassKey = keyof MenubarClasses;

function ComposedMenubarRoot({ children, classes, onSelect, positioning }: ComposedMenubarProps) {
  const rootId = uniqueId('menubar');

  // Mutable state for active menu and cleanup functions.
  const state: {
    activeMenu: string | null;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { activeMenu: null, floatingCleanup: null, dismissCleanup: null };

  function getRootEl(): HTMLElement | null {
    return document.getElementById(rootId);
  }

  function getMenuItems(contentEl: HTMLElement): HTMLElement[] {
    return [...contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function closeAll(): void {
    const root = getRootEl();
    if (!root) return;

    const triggers = root.querySelectorAll<HTMLElement>('[data-menubar-trigger]');
    const contents = root.querySelectorAll<HTMLElement>('[data-menubar-content]');

    for (const trigger of triggers) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('data-state', 'closed');
    }
    for (const content of contents) {
      content.setAttribute('data-state', 'closed');
      content.setAttribute('aria-hidden', 'true');
      content.style.display = 'none';
    }

    state.activeMenu = null;

    if (positioning) {
      state.floatingCleanup?.();
      state.floatingCleanup = null;
      state.dismissCleanup?.();
      state.dismissCleanup = null;
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const root = getRootEl();
    const target = event.target as Node;
    if (root && !root.contains(target)) {
      closeAll();
    }
  }

  function openMenu(value: string): void {
    const root = getRootEl();
    if (!root) return;

    const current = state.activeMenu;
    if (current && current !== value) {
      // Close previous
      const prevTrigger = root.querySelector<HTMLElement>(
        `[data-menubar-trigger][data-value="${current}"]`,
      );
      const prevContent = root.querySelector<HTMLElement>(
        `[data-menubar-content][data-value="${current}"]`,
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
      if (positioning) {
        state.floatingCleanup?.();
        state.floatingCleanup = null;
      }
    }

    const trigger = root.querySelector<HTMLElement>(
      `[data-menubar-trigger][data-value="${value}"]`,
    );
    const content = root.querySelector<HTMLElement>(
      `[data-menubar-content][data-value="${value}"]`,
    );
    if (!trigger || !content) return;

    state.activeMenu = value;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('data-state', 'open');
    content.setAttribute('aria-hidden', 'false');
    content.setAttribute('data-state', 'open');
    content.style.display = '';

    if (positioning) {
      const result = createFloatingPosition(trigger, content, positioning);
      state.floatingCleanup = result.cleanup;
      if (!state.dismissCleanup) {
        state.dismissCleanup = createDismiss({
          onDismiss: closeAll,
          insideElements: [root],
          escapeKey: false,
        });
      }
    } else {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Focus first item in the content
    const items = getMenuItems(content);
    const firstItem = items[0];
    if (firstItem) {
      firstItem.setAttribute('tabindex', '0');
      firstItem.focus();
    }
  }

  const ctx: MenubarContextValue = {
    rootId,
    classes,
    getOnSelect: () => onSelect,
    getPositioning: () => positioning,
    getActiveMenu: () => state.activeMenu,
    openMenu,
    closeAll,
  };

  return (
    <MenubarContext.Provider value={ctx}>
      <div role="menubar" id={rootId} class={classes?.root || undefined}>
        {children}
      </div>
    </MenubarContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedMenubar = Object.assign(ComposedMenubarRoot, {
  Menu: MenubarMenu,
  Trigger: MenubarTrigger,
  Content: MenubarContent,
  Item: MenubarItem,
  Group: MenubarGroup,
  Label: MenubarLabel,
  Separator: MenubarSeparator,
}) as ((props: ComposedMenubarProps) => HTMLElement) & {
  __classKeys?: MenubarClassKey;
  Menu: (props: MenuProps) => HTMLElement;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
