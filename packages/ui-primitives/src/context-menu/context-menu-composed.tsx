/**
 * Composed ContextMenu — fully declarative JSX implementation.
 * Sub-components self-wire via context. No factory delegation.
 *
 * Right-click context menu with keyboard navigation,
 * following WAI-ARIA menu pattern.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { setDataState, setHidden, setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition, virtualElement } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ContextMenuClasses {
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ContextMenuContextValue {
  classes?: ContextMenuClasses;
  onSelect?: (value: string) => void;
  /** @internal — registers content children for the root to place in the menu panel */
  _registerContent: (children: Node[]) => void;
  /** @internal — registers an item element for keyboard navigation */
  _registerItem: (el: HTMLDivElement) => void;
  /** @internal — registers the trigger element */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const ContextMenuContext = createContext<ContextMenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ContextMenuContext',
);

function useContextMenuContext(componentName: string): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error(
      `<ContextMenu.${componentName}> must be used inside <ContextMenu>. ` +
        'Ensure it is a direct or nested child of the ContextMenu root component.',
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
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function MenuTrigger({ children }: SlotProps) {
  const ctx = useContextMenuContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <ContextMenu.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);

  const wrapper = (
    <div data-part="trigger" style="display: contents">
      {...resolved}
    </div>
  ) as HTMLElement;

  ctx._registerTrigger(wrapper);

  return wrapper;
}

function MenuContent({ children }: SlotProps) {
  const ctx = useContextMenuContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <ContextMenu.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const resolved = resolveChildren(children);
  ctx._registerContent(resolved);

  return (<span style="display: none" />) as HTMLElement;
}

function MenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useContextMenuContext('Item');
  const effectiveCls = cls ?? classProp;

  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');
  const resolved = resolveChildren(children);

  const onSelect = ctx.onSelect;
  const el = buildMenuItemEl(value, itemClass, resolved, () => {
    onSelect?.(value);
  });

  ctx._registerItem(el);

  return el;
}

function MenuGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useContextMenuContext('Group');
  const effectiveCls = cls ?? classProp;

  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  const resolved = resolveChildren(children);

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {...resolved}
    </div>
  ) as HTMLDivElement;
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useContextMenuContext('Label');
  const effectiveCls = cls ?? classProp;

  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  ) as HTMLDivElement;
}

function MenuSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useContextMenuContext('Separator');
  const effectiveCls = cls ?? classProp;

  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return (<hr role="separator" class={sepClass || undefined} />) as HTMLHRElement;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedContextMenuProps {
  children?: ChildValue;
  classes?: ContextMenuClasses;
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export type ContextMenuClassKey = keyof ContextMenuClasses;

function ComposedContextMenuRoot({
  children,
  classes,
  onSelect,
  positioning,
}: ComposedContextMenuProps) {
  const ids = linkedIds('ctx-menu');

  // Plain object for registration storage — NOT let variables (compiler would signalize)
  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: Node[];
    items: HTMLDivElement[];
  } = {
    triggerEl: null,
    contentChildren: [],
    items: [],
  };

  // State as plain object — not reactive, mutated by closures
  const state: {
    isOpen: boolean;
    activeIndex: number;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
    resolvedNodes: Node[];
  } = {
    isOpen: false,
    activeIndex: -1,
    floatingCleanup: null,
    dismissCleanup: null,
    resolvedNodes: [],
  };

  const ctxValue: ContextMenuContextValue = {
    classes,
    onSelect,
    _registerTrigger: (el: HTMLElement) => {
      reg.triggerEl = el;
    },
    _registerContent: (children: Node[]) => {
      children.forEach((child) => {
        reg.contentChildren.push(child);
      });
    },
    _registerItem: (el: HTMLDivElement) => {
      reg.items.push(el);
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  ContextMenuContext.Provider(ctxValue, () => {
    state.resolvedNodes = resolveChildren(children);
  });

  // --- Build the content panel ---

  const contentPanel = (
    <div
      role="menu"
      tabindex="-1"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="position: fixed; display: none;"
      class={classes?.content || undefined}
    >
      {...reg.contentChildren}
    </div>
  ) as HTMLDivElement;

  // --- State management functions ---

  function updateActiveItem(index: number): void {
    reg.items.forEach((item, i) => {
      item.setAttribute('tabindex', i === index ? '0' : '-1');
    });
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (reg.triggerEl?.contains(target)) return;
    if (contentPanel.contains(target)) return;
    close();
  }

  function open(x: number, y: number): void {
    state.isOpen = true;
    state.activeIndex = -1;

    setHidden(contentPanel, false);
    setDataState(contentPanel, 'open');

    const positioningOpts = positioning ?? { strategy: 'fixed' as const };
    const result = createFloatingPosition(virtualElement(x, y), contentPanel, {
      strategy: 'fixed',
      ...positioningOpts,
    });
    state.floatingCleanup = result.cleanup;
    state.dismissCleanup = createDismiss({
      onDismiss: close,
      insideElements: [...(reg.triggerEl ? [reg.triggerEl] : []), contentPanel],
      escapeKey: false,
    });

    updateActiveItem(-1);
    contentPanel.focus();
  }

  function close(): void {
    state.isOpen = false;

    setHiddenAnimated(contentPanel, true);
    setDataState(contentPanel, 'closed');

    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;

    document.removeEventListener('mousedown', handleClickOutside);
  }

  // --- Wire keyboard handler on content panel ---

  const handleContentKeydown = (event: KeyboardEvent) => {
    if (isKey(event, Keys.Escape)) {
      event.preventDefault();
      close();
      return;
    }

    if (isKey(event, Keys.Enter, Keys.Space)) {
      event.preventDefault();
      const active = reg.items[state.activeIndex];
      if (active) {
        const val = active.getAttribute('data-value');
        if (val !== null) {
          onSelect?.(val);
          close();
        }
      }
      return;
    }

    if (state.activeIndex === -1) {
      if (isKey(event, Keys.ArrowDown)) {
        event.preventDefault();
        state.activeIndex = 0;
        updateActiveItem(0);
        reg.items[0]?.focus();
        return;
      }
      if (isKey(event, Keys.ArrowUp)) {
        event.preventDefault();
        const last = reg.items.length - 1;
        state.activeIndex = last;
        updateActiveItem(last);
        reg.items[last]?.focus();
        return;
      }
    }

    const result = handleListNavigation(event, reg.items, { orientation: 'vertical' });
    if (result) {
      const idx = reg.items.indexOf(result as HTMLDivElement);
      if (idx >= 0) {
        state.activeIndex = idx;
        updateActiveItem(idx);
      }
      return;
    }

    // Type-ahead: single character search
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const char = event.key.toLowerCase();
      const match = reg.items.find((item) => item.textContent?.toLowerCase().startsWith(char));
      if (match) {
        const idx = reg.items.indexOf(match);
        state.activeIndex = idx;
        updateActiveItem(idx);
        match.focus();
      }
    }
  };

  contentPanel.addEventListener('keydown', handleContentKeydown);
  _tryOnCleanup(() => contentPanel.removeEventListener('keydown', handleContentKeydown));

  // --- Wire item click → close via event delegation ---
  const handleContentClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest('[role="menuitem"]');
    if (target) {
      close();
    }
  };
  contentPanel.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => contentPanel.removeEventListener('click', handleContentClick));

  // --- Wire the trigger for contextmenu event ---

  if (reg.triggerEl) {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (state.isOpen) {
        close();
      }
      open(event.clientX, event.clientY);
    };
    reg.triggerEl.addEventListener('contextmenu', handleContextMenu);
    _tryOnCleanup(() => reg.triggerEl?.removeEventListener('contextmenu', handleContextMenu));
  }

  return (
    <div style="display: contents">
      {...state.resolvedNodes}
      {contentPanel}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedContextMenu = Object.assign(ComposedContextMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
}) as ((props: ComposedContextMenuProps) => HTMLElement) & {
  __classKeys?: ContextMenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
