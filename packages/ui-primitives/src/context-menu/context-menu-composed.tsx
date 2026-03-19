/**
 * Composed ContextMenu — compound component with right-click trigger.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items are discovered from the DOM via querySelectorAll when menu opens.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';
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
  open: (x: number, y: number) => void;
  close: () => void;
  /** @internal Set by Content to share its element reference with Root. */
  _setContentEl: (el: HTMLElement) => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
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
  const ctx = useContextMenuContext('Trigger');
  const el = (
    <div style="display: contents" data-part="trigger" data-contextmenu-trigger="">
      {children}
    </div>
  );

  onMount(() => {
    const triggerEl = el as HTMLElement;
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      ctx.open(e.clientX, e.clientY);
    }
    triggerEl.addEventListener('contextmenu', handleContextMenu);
    return () => triggerEl.removeEventListener('contextmenu', handleContextMenu);
  });

  return el;
}

function ContextMenuContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useContextMenuContext('Content');

  // Track content instances per Root for duplicate detection.
  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <ContextMenu.Content> detected \u2013 only the first is used');
  }

  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  const el = (
    <div
      role="menu"
      tabindex="-1"
      id={ctx.contentId}
      data-contextmenu-content=""
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={combined || undefined}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape, Keys.Tab)) {
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
      }}
    >
      {children}
    </div>
  );

  // Share the exact element reference with Root so open()/close() update
  // the same JS wrapper that consumers obtain via querySelector.
  ctx._setContentEl(el as HTMLElement);

  return el;
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
// Imperative DOM helpers for content element state
// ---------------------------------------------------------------------------

function updateContentDOM(el: HTMLElement, isOpen: boolean): void {
  el.setAttribute('data-state', isOpen ? 'open' : 'closed');
  el.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  el.style.display = isOpen ? '' : 'none';
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

  // Direct reference to the content element, set by ContextMenuContent.
  // Using this avoids happy-dom wrapper identity issues where
  // document.getElementById returns a different JS wrapper than querySelector.
  const shared: { contentEl: HTMLElement | null } = { contentEl: null };

  const state: {
    activeIndex: number;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { activeIndex: -1, floatingCleanup: null, dismissCleanup: null };

  function getContentEl(): HTMLElement | null {
    return shared.contentEl ?? document.getElementById(ids.contentId);
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

  function open(x: number, y: number): void {
    isOpen = true;
    state.activeIndex = -1;
    onOpenChange?.(true);

    // Imperatively update the content element so DOM reflects the open state
    // immediately — the JSX attributes on Content use the snapshot `ctx.isOpen`
    // which is not reactive through the context object.
    const contentEl = getContentEl();
    if (contentEl) {
      updateContentDOM(contentEl, true);
    }

    queueMicrotask(() => {
      const el = contentEl ?? getContentEl();
      if (!el) return;

      const effectivePositioning: FloatingOptions = {
        ...(positioning ?? {}),
        placement: positioning?.placement ?? 'bottom-start',
      };

      const result = createFloatingPosition(virtualElement(x, y), el, effectivePositioning);
      state.floatingCleanup = result.cleanup;
      state.dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [el],
        escapeKey: false,
      });

      const items = getItems();
      updateActiveItem(items, -1);
      el.focus();
    });
  }

  function close(): void {
    isOpen = false;
    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;
    onOpenChange?.(false);

    // Imperatively update the content element DOM to reflect closed state.
    const contentEl = getContentEl();
    if (contentEl) {
      updateContentDOM(contentEl, false);
    }
  }

  const ctx: ContextMenuContextValue = {
    isOpen,
    contentId: ids.contentId,
    classes,
    onSelect,
    open,
    close,
    _setContentEl: (el: HTMLElement) => {
      shared.contentEl = el;
    },
    _contentCount: { value: 0 },
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
