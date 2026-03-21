/**
 * Composed Menubar — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Triggers and content panels are discovered from the DOM via querySelectorAll.
 * No registration phase, no resolveChildren, no internal API imports.
 *
 * Follows WAI-ARIA menubar pattern with cross-menu keyboard navigation.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
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
  rootRef: Ref<HTMLDivElement>;
  classes?: MenubarClasses;
  getOnSelect: () => ((value: string) => void) | undefined;
  getPositioning: () => FloatingOptions | undefined;
  getActiveMenu: () => string | null;
  openMenu: (value: string) => void;
  closeAll: () => void;
  navigateMenu: (direction: 1 | -1) => void;
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
      <span style={{ display: 'contents' }} data-menubar-menu="">
        {children}
      </span>
    </MenuContext.Provider>
  );
}

function MenubarTrigger({ children, className: cls, class: classProp }: SlotProps) {
  // Check MenuContext first so the error message says "must be used inside <Menubar.Menu>"
  // when called outside both Menu and Menubar.
  const menuCtx = useMenuContext('Trigger');
  const barCtx = useMenubarContext('Trigger');
  const el = (
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
      class={cn(menuCtx.classes?.trigger, cls ?? classProp)}
    >
      {children ?? menuCtx.menuValue}
    </button>
  );

  // Use imperative event listeners registered via onMount so cleanup is
  // captured by the disposal scope.
  onMount(() => {
    const btnEl = el as HTMLElement;

    function handleClick() {
      if (barCtx.getActiveMenu() === menuCtx.menuValue) {
        barCtx.closeAll();
      } else {
        barCtx.openMenu(menuCtx.menuValue);
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        barCtx.openMenu(menuCtx.menuValue);
      }
    }

    btnEl.addEventListener('click', handleClick);
    btnEl.addEventListener('keydown', handleKeydown);

    return () => {
      btnEl.removeEventListener('click', handleClick);
      btnEl.removeEventListener('keydown', handleKeydown);
    };
  });

  return el;
}

function MenubarContent({ children, className: cls, class: classProp }: SlotProps) {
  const menuCtx = useMenuContext('Content');
  const barCtx = useMenubarContext('Content');
  const el = (
    <div
      role="menu"
      id={menuCtx.contentId}
      data-menubar-content=""
      data-value={menuCtx.menuValue}
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      class={cn(menuCtx.classes?.content, cls ?? classProp)}
    >
      {children}
    </div>
  );

  // Wire keyboard handler on the content element via onMount.
  onMount(() => {
    const contentEl = el as HTMLElement;

    function handleKeydown(event: KeyboardEvent) {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        barCtx.closeAll();
        // Focus the trigger for this menu
        const root = barCtx.rootRef.current;
        if (root) {
          const trigger = root.querySelector<HTMLElement>(
            `[data-menubar-trigger][data-value="${menuCtx.menuValue}"]`,
          );
          trigger?.focus();
        }
        return;
      }

      if (isKey(event, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        const items = [...contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const active = items.find((item) => item === document.activeElement);
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) {
            barCtx.getOnSelect()?.(val);
            barCtx.closeAll();
          }
        }
        return;
      }

      if (isKey(event, Keys.ArrowDown, Keys.ArrowUp)) {
        event.preventDefault();
        const items = [...contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        if (items.length === 0) return;
        const currentIdx = items.indexOf(document.activeElement as HTMLElement);
        const direction = isKey(event, Keys.ArrowDown) ? 1 : -1;
        const nextIdx = (((currentIdx + direction) % items.length) + items.length) % items.length;
        items[nextIdx]?.focus();
        return;
      }

      if (isKey(event, Keys.ArrowRight)) {
        event.preventDefault();
        event.stopPropagation();
        barCtx.navigateMenu(1);
        return;
      }

      if (isKey(event, Keys.ArrowLeft)) {
        event.preventDefault();
        event.stopPropagation();
        barCtx.navigateMenu(-1);
        return;
      }
    }

    contentEl.addEventListener('keydown', handleKeydown);

    return () => {
      contentEl.removeEventListener('keydown', handleKeydown);
    };
  });

  return el;
}

function MenubarItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const barCtx = useMenubarContext('Item');
  const menuCtx = useMenuContext('Item');

  return (
    <div
      role="menuitem"
      data-menubar-item=""
      data-value={value}
      tabindex="-1"
      class={cn(menuCtx.classes?.item, cls ?? classProp)}
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

  return (
    <div role="group" aria-label={label} class={cn(menuCtx.classes?.group, cls ?? classProp)}>
      {children}
    </div>
  );
}

function MenubarLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Label');

  return (
    <div role="none" class={cn(classes?.label, cls ?? classProp)}>
      {children}
    </div>
  );
}

function MenubarSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Separator');

  return <hr role="separator" class={cn(classes?.separator, cls ?? classProp)} />;
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
  const rootRef: Ref<HTMLDivElement> = ref();

  // Mutable state for active menu and cleanup functions.
  const state: {
    activeMenu: string | null;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { activeMenu: null, floatingCleanup: null, dismissCleanup: null };

  function getRootEl(): HTMLElement | null {
    return rootRef.current ?? null;
  }

  function getMenuItems(contentEl: HTMLElement): HTMLElement[] {
    return [...contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function getMenuValues(): string[] {
    const root = getRootEl();
    if (!root) return [];
    const triggers = root.querySelectorAll<HTMLElement>('[data-menubar-trigger]');
    return [...triggers].map((t) => t.getAttribute('data-value')!);
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

    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;
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
      state.floatingCleanup?.();
      state.floatingCleanup = null;
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

    {
      const floatingOpts = positioning ?? { placement: 'bottom-start', offset: 4 };
      content.style.position = 'fixed';
      const result = createFloatingPosition(trigger, content, floatingOpts);
      state.floatingCleanup = result.cleanup;
      if (!state.dismissCleanup) {
        state.dismissCleanup = createDismiss({
          onDismiss: closeAll,
          insideElements: [root],
          escapeKey: false,
        });
      }
    }

    // Focus first item in the content
    const items = getMenuItems(content);
    const firstItem = items[0];
    if (firstItem) {
      firstItem.setAttribute('tabindex', '0');
      firstItem.focus();
    }
  }

  function navigateMenu(direction: 1 | -1): void {
    const values = getMenuValues();
    if (values.length === 0) return;

    const currentIdx = state.activeMenu ? values.indexOf(state.activeMenu) : -1;
    const nextIdx = (((currentIdx + direction) % values.length) + values.length) % values.length;
    const nextValue = values[nextIdx];
    if (nextValue) {
      openMenu(nextValue);
    }
  }

  const ctx: MenubarContextValue = {
    rootId,
    rootRef,
    classes,
    getOnSelect: () => onSelect,
    getPositioning: () => positioning,
    getActiveMenu: () => state.activeMenu,
    openMenu,
    closeAll,
    navigateMenu,
  };

  return (
    <MenubarContext.Provider value={ctx}>
      <div
        ref={rootRef}
        role="menubar"
        id={rootId}
        class={cn(classes?.root)}
        onKeydown={(event: KeyboardEvent) => {
          // Handle ArrowRight/ArrowLeft on the root for trigger-level navigation
          if (state.activeMenu && isKey(event, Keys.ArrowRight)) {
            event.preventDefault();
            navigateMenu(1);
          } else if (state.activeMenu && isKey(event, Keys.ArrowLeft)) {
            event.preventDefault();
            navigateMenu(-1);
          }
        }}
      >
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
