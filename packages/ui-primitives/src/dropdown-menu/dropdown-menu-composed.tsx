/**
 * Composed DropdownMenu — fully declarative JSX implementation.
 * Sub-components self-wire via context. No factory delegation.
 *
 * Phase 9 of the primitives JSX migration (PR #1363).
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface DropdownMenuClasses {
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DropdownMenuContextValue {
  classes?: DropdownMenuClasses;
  onSelect?: (value: string) => void;
  /** @internal — registers the user trigger element for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children for the root to place in the menu panel */
  _registerContent: (children: Node[]) => void;
  /** @internal — registers an item element for keyboard navigation */
  _registerItem: (el: HTMLDivElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DropdownMenuContext',
);

function useDropdownMenuContext(componentName: string): DropdownMenuContextValue {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error(
      `<DropdownMenu.${componentName}> must be used inside <DropdownMenu>. ` +
        'Ensure it is a direct or nested child of the DropdownMenu root component.',
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
  const ctx = useDropdownMenuContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <DropdownMenu.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { _registerTrigger } = ctx;

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire initial ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'menu');
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // Register for ARIA sync + click wiring in root
    _registerTrigger(userTrigger);
  }

  return (<span style="display: contents">{...resolved}</span>) as HTMLElement;
}

function MenuContent({ children }: SlotProps) {
  const ctx = useDropdownMenuContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <DropdownMenu.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  // Resolve children (Items, Groups, Labels, Separators) — this triggers registrations
  const resolved = resolveChildren(children);

  // Register the resolved content nodes with root
  ctx._registerContent(resolved);

  // Return a placeholder — root builds the actual content panel
  return (<span style="display: none" />) as HTMLElement;
}

function MenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useDropdownMenuContext('Item');
  const effectiveCls = cls ?? classProp;

  // Build the class combining theme + per-instance
  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');

  // Resolve children
  const resolved = resolveChildren(children);

  // Build item element via standalone helper
  const onSelect = ctx.onSelect;
  const el = buildMenuItemEl(value, itemClass, resolved, () => {
    onSelect?.(value);
  });

  // Register item with root for keyboard navigation
  ctx._registerItem(el);

  return el;
}

function MenuGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useDropdownMenuContext('Group');
  const effectiveCls = cls ?? classProp;

  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  // Resolve children inside context — items still register to root's items array
  const resolved = resolveChildren(children);

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {...resolved}
    </div>
  ) as HTMLDivElement;
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDropdownMenuContext('Label');
  const effectiveCls = cls ?? classProp;

  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  ) as HTMLDivElement;
}

function MenuSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useDropdownMenuContext('Separator');
  const effectiveCls = cls ?? classProp;

  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return (<hr role="separator" class={sepClass || undefined} />) as HTMLHRElement;
}

// ---------------------------------------------------------------------------
// Context value builder — outside component body to avoid computed() wrapping
// ---------------------------------------------------------------------------

function buildCtxValue(
  reg: {
    userTrigger: HTMLElement | null;
    contentChildren: Node[];
    items: HTMLDivElement[];
  },
  classes: DropdownMenuClasses | undefined,
  onSelect: ((value: string) => void) | undefined,
): DropdownMenuContextValue {
  return {
    classes,
    onSelect,
    _registerTrigger: (el: HTMLElement) => {
      reg.userTrigger = el;
    },
    _registerContent: (children: Node[]) => {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child) reg.contentChildren.push(child);
      }
    },
    _registerItem: (el: HTMLDivElement) => {
      reg.items.push(el);
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedDropdownMenuProps {
  children?: ChildValue;
  classes?: DropdownMenuClasses;
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export type DropdownMenuClassKey = keyof DropdownMenuClasses;

function ComposedDropdownMenuRoot({
  children,
  classes,
  onSelect,
  onOpenChange,
  positioning,
}: ComposedDropdownMenuProps) {
  const ids = linkedIds('menu');

  // Plain object for registration storage — NOT let variables (compiler would signalize)
  const reg: {
    userTrigger: HTMLElement | null;
    contentChildren: Node[];
    items: HTMLDivElement[];
  } = {
    userTrigger: null,
    contentChildren: [],
    items: [],
  };

  // State as plain object — not reactive, mutated by closures
  const state: { isOpen: boolean; activeIndex: number } = {
    isOpen: false,
    activeIndex: -1,
  };
  let floatingCleanup: (() => void) | null = null;
  let dismissCleanup: (() => void) | null = null;

  // Build context value via helper to avoid compiler computed() wrapping
  const ctxValue = buildCtxValue(reg, classes, onSelect);

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  DropdownMenuContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  // --- Build the content panel ---

  const contentPanel = (
    <div
      role="menu"
      tabindex="-1"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={classes?.content || undefined}
    >
      {...reg.contentChildren}
    </div>
  ) as HTMLDivElement;

  // --- State management functions ---

  function updateActiveItem(index: number): void {
    for (let i = 0; i < reg.items.length; i++) {
      reg.items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (reg.userTrigger?.contains(target)) return;
    if (contentPanel.contains(target)) return;
    close();
  }

  function open(activateFirst = false): void {
    state.isOpen = true;
    state.activeIndex = -1;

    setHidden(contentPanel, false);
    setDataState(contentPanel, 'open');

    if (reg.userTrigger) {
      setExpanded(reg.userTrigger, true);
      setDataState(reg.userTrigger, 'open');
    }

    onOpenChange?.(true);

    if (positioning) {
      const ref = positioning.referenceElement ?? reg.userTrigger ?? contentPanel;
      const result = createFloatingPosition(ref, contentPanel, positioning);
      floatingCleanup = result.cleanup;
      dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [ref, contentPanel, ...(reg.userTrigger ? [reg.userTrigger] : [])],
        escapeKey: false,
      });
    } else {
      document.addEventListener('mousedown', handleClickOutside);
    }

    if (activateFirst && reg.items.length > 0) {
      state.activeIndex = 0;
      updateActiveItem(0);
      reg.items[0]?.focus();
    } else {
      updateActiveItem(-1);
      contentPanel.focus();
    }
  }

  function close(): void {
    state.isOpen = false;

    setHiddenAnimated(contentPanel, true);
    setDataState(contentPanel, 'closed');

    if (reg.userTrigger) {
      setExpanded(reg.userTrigger, false);
      setDataState(reg.userTrigger, 'closed');
    }

    onOpenChange?.(false);

    if (positioning) {
      floatingCleanup?.();
      floatingCleanup = null;
      dismissCleanup?.();
      dismissCleanup = null;
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    reg.userTrigger?.focus();
  }

  function toggle(): void {
    if (state.isOpen) {
      close();
    } else {
      open();
    }
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

  // --- Wire the user trigger ---

  if (reg.userTrigger) {
    reg.userTrigger.setAttribute('aria-controls', ids.contentId);

    const handleTriggerClick = () => {
      toggle();
    };
    reg.userTrigger.addEventListener('click', handleTriggerClick);
    _tryOnCleanup(() => reg.userTrigger?.removeEventListener('click', handleTriggerClick));
  }

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {contentPanel}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedDropdownMenu = Object.assign(ComposedDropdownMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
}) as ((props: ComposedDropdownMenuProps) => HTMLElement) & {
  __classKeys?: DropdownMenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
