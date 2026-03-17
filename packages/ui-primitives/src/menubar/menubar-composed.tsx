/**
 * Composed Menubar — fully declarative JSX implementation.
 * Sub-components self-wire via context. No factory delegation.
 *
 * Follows WAI-ARIA menubar pattern with cross-menu keyboard navigation.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

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
  classes?: MenubarClasses;
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
  /** @internal — registers a menu's trigger, content, and items */
  _registerMenu: (
    value: string,
    trigger: HTMLButtonElement,
    content: HTMLDivElement,
    items: HTMLDivElement[],
  ) => void;
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
  classes?: MenubarClasses;
  /** @internal — registers the trigger element */
  _registerTrigger: (el: HTMLButtonElement) => void;
  /** @internal — registers content children */
  _registerContent: (children: Node[]) => void;
  /** @internal — registers an item element */
  _registerItem: (el: HTMLDivElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Element builder — outside component body to avoid computed() wrapping
// ---------------------------------------------------------------------------

function buildMenuItemEl(
  value: string,
  itemClass: string,
  children: Node[],
  onItemClick: () => void,
): HTMLDivElement {
  return (
    <div
      role="menuitem"
      data-value={value}
      tabindex="-1"
      class={itemClass || undefined}
      onClick={() => {
        onItemClick();
      }}
    >
      {...children}
    </div>
  ) as HTMLDivElement;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenubarMenu({ value, children }: MenuProps) {
  const barCtx = useMenubarContext('Menu');

  const reg: {
    userTrigger: HTMLButtonElement | null;
    contentChildren: Node[];
    items: HTMLDivElement[];
  } = {
    userTrigger: null,
    contentChildren: [],
    items: [],
  };

  const menuCtxValue: MenuContextValue = {
    menuValue: value,
    classes: barCtx.classes,
    _registerTrigger: (el: HTMLButtonElement) => {
      reg.userTrigger = el;
    },
    _registerContent: (childNodes: Node[]) => {
      childNodes.forEach((child) => {
        reg.contentChildren.push(child);
      });
    },
    _registerItem: (el: HTMLDivElement) => {
      reg.items.push(el);
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Resolve children to collect registrations
  const resolvedNodes: Node[] = [];
  MenuContext.Provider(menuCtxValue, () => {
    const nodes = resolveChildren(children);
    nodes.forEach((n) => resolvedNodes.push(n));
  });

  // Build trigger button
  const ids = linkedIds('menubar-menu');
  const triggerClass = barCtx.classes?.trigger;
  const trigger = (
    <button
      type="button"
      role="menuitem"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-haspopup="menu"
      data-value={value}
      aria-expanded="false"
      data-state="closed"
      class={triggerClass || undefined}
    >
      {reg.userTrigger ? [...(reg.userTrigger.childNodes as unknown as Node[])] : value}
    </button>
  ) as HTMLButtonElement;

  // If user provided a trigger, copy its text content into the button
  if (reg.userTrigger) {
    // Clear the button and move user trigger children in
    trigger.textContent = '';
    while (reg.userTrigger.firstChild) {
      trigger.appendChild(reg.userTrigger.firstChild);
    }
  }

  // Build content panel
  const contentClass = barCtx.classes?.content;
  const content = (
    <div
      role="menu"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={contentClass || undefined}
    >
      {...reg.contentChildren}
    </div>
  ) as HTMLDivElement;

  // Register with the bar
  barCtx._registerMenu(value, trigger, content, reg.items);

  return (<span style="display: contents" />) as HTMLElement;
}

function MenubarTrigger({ children }: SlotProps) {
  const ctx = useMenuContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Menubar.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  // Create a wrapper to carry content — MenubarMenu will extract children
  const wrapper = (<span style="display: contents">{...resolved}</span>) as HTMLElement;
  ctx._registerTrigger(wrapper as unknown as HTMLButtonElement);

  return (<span style="display: none" />) as HTMLElement;
}

function MenubarContent({ children }: SlotProps) {
  const ctx = useMenuContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Menubar.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const resolved = resolveChildren(children);
  ctx._registerContent(resolved);

  return (<span style="display: none" />) as HTMLElement;
}

function MenubarItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const menuCtx = useMenuContext('Item');
  const effectiveCls = cls ?? classProp;

  const itemClass = [menuCtx.classes?.item, effectiveCls].filter(Boolean).join(' ');
  const resolved = resolveChildren(children);

  const el = buildMenuItemEl(value, itemClass, resolved, () => {
    // onSelect is handled via click event delegation on the content panel
  });

  menuCtx._registerItem(el);

  return el;
}

function MenubarGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const menuCtx = useMenuContext('Group');
  const effectiveCls = cls ?? classProp;

  const groupClass = [menuCtx.classes?.group, effectiveCls].filter(Boolean).join(' ');
  const resolved = resolveChildren(children);

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {...resolved}
    </div>
  ) as HTMLDivElement;
}

function MenubarLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Label');
  const effectiveCls = cls ?? classProp;

  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  ) as HTMLDivElement;
}

function MenubarSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Separator');
  const effectiveCls = cls ?? classProp;

  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return (<hr role="separator" class={sepClass || undefined} />) as HTMLHRElement;
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
  const triggers: HTMLButtonElement[] = [];
  const menus: Map<
    string,
    { trigger: HTMLButtonElement; content: HTMLDivElement; items: HTMLDivElement[] }
  > = new Map();

  const state: {
    activeMenu: string | null;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = {
    activeMenu: null,
    floatingCleanup: null,
    dismissCleanup: null,
  };

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!root.contains(target)) {
      closeAll();
    }
  }

  function closeAll(): void {
    for (const [, menu] of menus) {
      setExpanded(menu.trigger, false);
      setDataState(menu.trigger, 'closed');
      setDataState(menu.content, 'closed');
      setHiddenAnimated(menu.content, true);
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

  function openMenu(value: string): void {
    const current = state.activeMenu;
    if (current && current !== value) {
      const prev = menus.get(current);
      if (prev) {
        setExpanded(prev.trigger, false);
        setDataState(prev.trigger, 'closed');
        setDataState(prev.content, 'closed');
        setHiddenAnimated(prev.content, true);
      }
      if (positioning) {
        state.floatingCleanup?.();
        state.floatingCleanup = null;
      }
    }

    const menu = menus.get(value);
    if (!menu) return;
    state.activeMenu = value;
    setExpanded(menu.trigger, true);
    setHidden(menu.content, false);
    setDataState(menu.trigger, 'open');
    setDataState(menu.content, 'open');

    if (positioning) {
      const result = createFloatingPosition(menu.trigger, menu.content, positioning);
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

    const firstItem = menu.items[0];
    if (firstItem) {
      firstItem.setAttribute('tabindex', '0');
      firstItem.focus();
    }
  }

  // Build root element
  const rootClass = classes?.root;
  const root = (
    <div
      role="menubar"
      class={rootClass || undefined}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
          const focused = document.activeElement;
          const triggerIndex = triggers.indexOf(focused as HTMLButtonElement);

          if (triggerIndex >= 0) {
            const result = handleListNavigation(event, triggers, { orientation: 'horizontal' });
            if (result && state.activeMenu) {
              const newTrigger = result as HTMLButtonElement;
              const menuValue = newTrigger.getAttribute('data-value');
              if (menuValue) openMenu(menuValue);
            }
          }
        }
      }}
    />
  ) as HTMLDivElement;

  const ctxValue: MenubarContextValue = {
    classes,
    onSelect,
    positioning,
    _registerMenu: (
      value: string,
      trigger: HTMLButtonElement,
      content: HTMLDivElement,
      items: HTMLDivElement[],
    ) => {
      // Wire trigger click
      const handleTriggerClick = () => {
        if (state.activeMenu === value) {
          closeAll();
        } else {
          openMenu(value);
        }
      };
      trigger.addEventListener('click', handleTriggerClick);
      _tryOnCleanup(() => trigger.removeEventListener('click', handleTriggerClick));

      // Wire trigger keyboard
      const handleTriggerKeydown = (event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          openMenu(value);
        }
      };
      trigger.addEventListener('keydown', handleTriggerKeydown);
      _tryOnCleanup(() => trigger.removeEventListener('keydown', handleTriggerKeydown));

      // Wire content keyboard
      const handleContentKeydown = (event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          closeAll();
          trigger.focus();
          return;
        }

        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          const active = document.activeElement;
          const activeItem = items.find((item) => item === active);
          if (activeItem) {
            const val = activeItem.getAttribute('data-value');
            if (val !== null) {
              onSelect?.(val);
              closeAll();
              trigger.focus();
            }
          }
          return;
        }

        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight)) {
          event.preventDefault();
          const triggerIdx = triggers.indexOf(trigger);
          let nextIdx: number;
          if (isKey(event, Keys.ArrowRight)) {
            nextIdx = (triggerIdx + 1) % triggers.length;
          } else {
            nextIdx = (triggerIdx - 1 + triggers.length) % triggers.length;
          }
          const nextTrigger = triggers[nextIdx];
          if (nextTrigger) {
            nextTrigger.focus();
            const nextValue = nextTrigger.getAttribute('data-value');
            if (nextValue) openMenu(nextValue);
          }
          return;
        }

        handleListNavigation(event, items, { orientation: 'vertical' });
      };
      content.addEventListener('keydown', handleContentKeydown);
      _tryOnCleanup(() => content.removeEventListener('keydown', handleContentKeydown));

      // Wire item click → close via event delegation
      const handleContentClick = (event: Event) => {
        const target = (event.target as HTMLElement).closest('[role="menuitem"]');
        if (target && content.contains(target)) {
          const val = target.getAttribute('data-value');
          if (val !== null) {
            onSelect?.(val);
            closeAll();
            trigger.focus();
          }
        }
      };
      content.addEventListener('click', handleContentClick);
      _tryOnCleanup(() => content.removeEventListener('click', handleContentClick));

      triggers.push(trigger);
      setRovingTabindex(triggers, 0);
      menus.set(value, { trigger, content, items });
      root.appendChild(trigger);
    },
  };

  // Resolve children within context
  MenubarContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Append content panels after all menus are registered
  for (const [, menu] of menus) {
    root.appendChild(menu.content);
  }

  return root;
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
