/**
 * Composed Menu — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items are discovered from the DOM via querySelectorAll when menu opens.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition, resolveLayoutElement } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface MenuClasses {
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface MenuContextValue {
  isOpen: () => boolean;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: MenuClasses;
  onSelect?: (value: string) => void;
  open: (activateFirst?: boolean) => void;
  close: () => void;
  toggle: () => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
}

const MenuContext = createContext<MenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::MenuContext',
);

function useMenuContext(componentName: string): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error(
      `<Menu.${componentName}> must be used inside <Menu>. ` +
        'Ensure it is a direct or nested child of the Menu root component.',
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

interface ItemProps extends SlotProps {
  value: string;
}

interface GroupProps extends SlotProps {
  label: string;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function MenuTrigger({ children }: SlotProps) {
  const ctx = useMenuContext('Trigger');

  return (
    <span
      style={{ display: 'contents' }}
      data-menu-trigger=""
      aria-haspopup="menu"
      aria-controls={ctx.contentId}
      aria-expanded="false"
      data-state="closed"
      onClick={() => ctx.toggle()}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!ctx.isOpen()) ctx.open(true);
        }
      }}
    >
      {children}
    </span>
  );
}

function MenuContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useMenuContext('Content');

  // Track content instances per Root for duplicate detection.
  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <Menu.Content> detected \u2013 only the first is used');
  }

  return (
    <div
      ref={ctx.contentRef}
      role="menu"
      tabindex="-1"
      id={ctx.contentId}
      data-menu-content=""
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          ctx.close();
          return;
        }

        const el = (event.currentTarget ?? event.target) as HTMLElement;
        const items = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const focusedIdx = items.indexOf(document.activeElement as HTMLElement);

        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          const active = items[focusedIdx];
          if (active) {
            const val = active.getAttribute('data-value');
            if (val !== null) {
              ctx.onSelect?.(val);
              ctx.close();
            }
          }
          return;
        }

        handleListNavigation(event, items, { orientation: 'vertical' });

        // Type-ahead: single character search
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const char = event.key.toLowerCase();
          const match = items.find((item) => item.textContent?.toLowerCase().startsWith(char));
          if (match) match.focus();
        }
      }}
      onClick={(event: Event) => {
        const target = (event.target as HTMLElement).closest('[role="menuitem"]');
        if (target) ctx.close();
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useMenuContext('Item');

  return (
    <div
      role="menuitem"
      data-value={value}
      tabindex="-1"
      class={cn(ctx.classes?.item, cls ?? classProp)}
      onClick={() => {
        ctx.onSelect?.(value);
        ctx.close();
      }}
    >
      {children}
    </div>
  );
}

function MenuGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useMenuContext('Group');

  return (
    <div role="group" aria-label={label} class={cn(ctx.classes?.group, cls ?? classProp)}>
      {children}
    </div>
  );
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Label');

  return (
    <div role="none" class={cn(classes?.label, cls ?? classProp)}>
      {children}
    </div>
  );
}

function MenuSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useMenuContext('Separator');

  return <hr role="separator" class={cn(classes?.separator, cls ?? classProp)} />;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedMenuProps {
  children?: ChildValue;
  classes?: MenuClasses;
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export type MenuClassKey = keyof MenuClasses;

function ComposedMenuRoot({
  children,
  classes,
  onSelect,
  onOpenChange,
  positioning,
}: ComposedMenuProps) {
  const ids = linkedIds('menu');
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;

  // Plain object for cleanup/state that shouldn't be signal-wrapped.
  const state: {
    activeIndex: number;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { activeIndex: -1, floatingCleanup: null, dismissCleanup: null };

  function getContentEl(): HTMLElement | null {
    return contentRef.current ?? null;
  }

  function getItems(): HTMLElement[] {
    const content = getContentEl();
    if (!content) return [];
    return [...content.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function getTriggerEl(): HTMLElement | null {
    const content = getContentEl();
    const triggerSpan = content?.parentElement?.querySelector(
      '[data-menu-trigger]',
    ) as HTMLElement | null;
    if (!triggerSpan) return null;
    return resolveLayoutElement(triggerSpan);
  }

  function updateActiveItem(items: HTMLElement[], index: number): void {
    items.forEach((item, i) => {
      item.setAttribute('tabindex', i === index ? '0' : '-1');
    });
  }

  function syncContentAttrs(): void {
    const contentEl = getContentEl();
    if (!contentEl) return;
    const open = isOpen;
    contentEl.style.display = open ? '' : 'none';
    contentEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    contentEl.setAttribute('data-state', open ? 'open' : 'closed');
    // Also update trigger attrs
    const triggerEl = getTriggerEl();
    if (triggerEl) {
      triggerEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      triggerEl.setAttribute('data-state', open ? 'open' : 'closed');
    }
  }

  function open(activateFirst = false): void {
    isOpen = true;
    state.activeIndex = -1;
    syncContentAttrs();
    onOpenChange?.(true);

    const contentEl = getContentEl();
    const triggerEl = getTriggerEl();
    if (!contentEl) return;

    {
      const floatingOpts = positioning ?? { placement: 'bottom-start', offset: 4 };
      const refEl = floatingOpts.referenceElement ?? triggerEl ?? contentEl;
      contentEl.style.position = 'fixed';
      const result = createFloatingPosition(refEl, contentEl, floatingOpts);
      state.floatingCleanup = result.cleanup;
      state.dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [refEl, contentEl, ...(triggerEl ? [triggerEl] : [])],
        escapeKey: false,
      });
    }

    const items = getItems();
    if (activateFirst && items.length > 0) {
      state.activeIndex = 0;
      updateActiveItem(items, 0);
      items[0]?.focus();
    } else {
      updateActiveItem(items, -1);
      contentEl.focus();
    }
  }

  function close(): void {
    isOpen = false;
    syncContentAttrs();
    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;
    onOpenChange?.(false);

    getTriggerEl()?.focus();
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  const ctx: MenuContextValue = {
    isOpen: () => isOpen,
    contentId: ids.contentId,
    contentRef,
    classes,
    onSelect,
    open,
    close,
    toggle,
    _contentCount: { value: 0 },
  };

  return (
    <MenuContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-menu-root="">
        {children}
      </span>
    </MenuContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedMenu = Object.assign(ComposedMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
}) as ((props: ComposedMenuProps) => HTMLElement) & {
  __classKeys?: MenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
