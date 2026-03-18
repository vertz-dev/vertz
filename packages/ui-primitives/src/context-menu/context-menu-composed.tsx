/**
 * Composed ContextMenu — compound component with right-click trigger.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items are discovered from the DOM via querySelectorAll when menu opens.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, lifecycleEffect, useContext } from '@vertz/ui';
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
  isOpen: boolean;
  contentId: string;
  classes?: ContextMenuClasses;
  onSelect?: (value: string) => void;
  close: () => void;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function ContextMenuTrigger({ children }: SlotProps) {
  return (
    <div style="display: contents" data-contextmenu-trigger="">
      {children}
    </div>
  );
}

function ContextMenuContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useContextMenuContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="menu"
      tabindex="-1"
      id={ctx.contentId}
      data-contextmenu-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

function ContextMenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useContextMenuContext('Item');
  const effectiveCls = cls ?? classProp;
  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="menuitem"
      data-value={value}
      tabindex="-1"
      class={itemClass || undefined}
      onClick={() => {
        ctx.onSelect?.(value);
        ctx.close();
      }}
    >
      {children}
    </div>
  );
}

function ContextMenuGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useContextMenuContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {children}
    </div>
  );
}

function ContextMenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useContextMenuContext('Label');
  const effectiveCls = cls ?? classProp;
  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  );
}

function ContextMenuSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useContextMenuContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return <hr role="separator" class={sepClass || undefined} />;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedContextMenuProps {
  children?: ChildValue;
  classes?: ContextMenuClasses;
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export type ContextMenuClassKey = keyof ContextMenuClasses;

function ComposedContextMenuRoot({
  children,
  classes,
  onSelect,
  onOpenChange,
  positioning,
}: ComposedContextMenuProps) {
  const ids = linkedIds('ctxmenu');

  let isOpen = false;

  const state: {
    activeIndex: number;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { activeIndex: -1, floatingCleanup: null, dismissCleanup: null };

  function getContentEl(): HTMLElement | null {
    return document.getElementById(ids.contentId);
  }

  function getItems(): HTMLElement[] {
    const content = getContentEl();
    if (!content) return [];
    return [...content.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function updateActiveItem(items: HTMLElement[], index: number): void {
    items.forEach((item, i) => {
      item.setAttribute('tabindex', i === index ? '0' : '-1');
    });
  }

  // Wire context menu (right-click) on the trigger element.
  // Read isOpen to ensure effect re-runs if element not found on first attempt.
  lifecycleEffect(() => {
    const _open = isOpen;
    void _open;
    const root = document.querySelector(`[data-contextmenu-root="${ids.contentId}"]`);
    const trigger = root?.querySelector('[data-contextmenu-trigger]') as HTMLElement | null;
    if (!trigger || (trigger as HTMLElement & { __ctxWired?: boolean }).__ctxWired) return;
    (trigger as HTMLElement & { __ctxWired?: boolean }).__ctxWired = true;

    trigger.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
      const me = e as MouseEvent;
      open(me.clientX, me.clientY);
    });
  });

  // Wire keyboard and click handlers on the connected content element.
  // Read isOpen to re-run when the menu opens (element may not be findable on first run).
  lifecycleEffect(() => {
    const _open = isOpen; // track signal so effect re-runs
    void _open;
    const el = getContentEl() as HTMLElement & { __menuWired?: boolean } | null;
    if (!el || el.__menuWired) return;
    el.__menuWired = true;

    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        close();
        return;
      }

      const items = getItems();

      if (isKey(event, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        const active = items[state.activeIndex];
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
          updateActiveItem(items, 0);
          items[0]?.focus();
          return;
        }
        if (isKey(event, Keys.ArrowUp)) {
          event.preventDefault();
          const last = items.length - 1;
          state.activeIndex = last;
          updateActiveItem(items, last);
          items[last]?.focus();
          return;
        }
      }

      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) {
        const idx = items.indexOf(result as HTMLElement);
        if (idx >= 0) {
          state.activeIndex = idx;
          updateActiveItem(items, idx);
        }
        return;
      }

      // Type-ahead
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const char = event.key.toLowerCase();
        const match = items.find((item) => item.textContent?.toLowerCase().startsWith(char));
        if (match) {
          const idx = items.indexOf(match);
          state.activeIndex = idx;
          updateActiveItem(items, idx);
          match.focus();
        }
      }
    });

    el.addEventListener('click', (event: Event) => {
      const target = (event.target as HTMLElement).closest('[role="menuitem"]');
      if (target) close();
    });
  });

  function open(x: number, y: number): void {
    isOpen = true;
    state.activeIndex = -1;
    onOpenChange?.(true);

    queueMicrotask(() => {
      const contentEl = getContentEl();
      if (!contentEl) return;

      const effectivePositioning: FloatingOptions = {
        ...(positioning ?? {}),
        placement: positioning?.placement ?? 'bottom-start',
      };

      const result = createFloatingPosition(virtualElement(x, y), contentEl, effectivePositioning);
      state.floatingCleanup = result.cleanup;
      state.dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [contentEl],
        escapeKey: false,
      });

      const items = getItems();
      updateActiveItem(items, -1);
      contentEl.focus();
    });
  }

  function close(): void {
    isOpen = false;
    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;
    onOpenChange?.(false);
  }

  const ctx: ContextMenuContextValue = {
    isOpen,
    contentId: ids.contentId,
    classes,
    onSelect,
    close,
  };

  return (
    <ContextMenuContext.Provider value={ctx}>
      <span style="display: contents" data-contextmenu-root={ids.contentId}>
        {children}
      </span>
    </ContextMenuContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedContextMenu = Object.assign(ComposedContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  Group: ContextMenuGroup,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
}) as ((props: ComposedContextMenuProps) => HTMLElement) & {
  __classKeys?: ContextMenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
