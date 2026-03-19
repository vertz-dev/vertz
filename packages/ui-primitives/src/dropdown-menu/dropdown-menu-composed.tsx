/**
 * Composed DropdownMenu — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items are discovered from the DOM via querySelectorAll when menu opens.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
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
  isOpen: boolean;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: DropdownMenuClasses;
  onSelect?: (value: string) => void;
  open: (activateFirst?: boolean) => void;
  close: () => void;
  toggle: () => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function MenuTrigger({ children }: SlotProps) {
  const ctx = useDropdownMenuContext('Trigger');

  // Forward ARIA attrs and events to the user's child element.
  onMount(() => {
    const childNodes = Array.isArray(children) ? children : [children];
    const childEl = childNodes.find((c): c is HTMLElement => c instanceof HTMLElement);
    if (!childEl) return;

    childEl.setAttribute('aria-haspopup', 'menu');
    childEl.setAttribute('aria-controls', ctx.contentId);
    childEl.setAttribute('aria-expanded', ctx.isOpen ? 'true' : 'false');
    childEl.setAttribute('data-state', ctx.isOpen ? 'open' : 'closed');

    const handleClick = () => ctx.toggle();
    const handleKeydown = (event: KeyboardEvent) => {
      if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        if (!ctx.isOpen) ctx.open(true);
      }
    };

    childEl.addEventListener('click', handleClick);
    childEl.addEventListener('keydown', handleKeydown);

    return () => {
      childEl.removeEventListener('click', handleClick);
      childEl.removeEventListener('keydown', handleKeydown);
    };
  });

  return (
    <span
      style="display: contents"
      data-dropdownmenu-trigger=""
      aria-haspopup="menu"
      aria-controls={ctx.contentId}
      aria-expanded={ctx.isOpen ? 'true' : 'false'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
    >
      {children}
    </span>
  );
}

function MenuContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDropdownMenuContext('Content');

  // Track content instances per Root for duplicate detection.
  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <DropdownMenu.Content> detected \u2013 only the first is used');
  }

  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      ref={ctx.contentRef}
      role="menu"
      tabindex="-1"
      id={ctx.contentId}
      data-dropdownmenu-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
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
  const ctx = useDropdownMenuContext('Item');
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

function MenuGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useDropdownMenuContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      {children}
    </div>
  );
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDropdownMenuContext('Label');
  const effectiveCls = cls ?? classProp;
  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="none" class={labelClass || undefined}>
      {children}
    </div>
  );
}

function MenuSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useDropdownMenuContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return <hr role="separator" class={sepClass || undefined} />;
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
    return content?.parentElement?.querySelector(
      '[data-dropdownmenu-trigger]',
    ) as HTMLElement | null;
  }

  function updateActiveItem(items: HTMLElement[], index: number): void {
    items.forEach((item, i) => {
      item.setAttribute('tabindex', i === index ? '0' : '-1');
    });
  }

  function open(activateFirst = false): void {
    isOpen = true;
    state.activeIndex = -1;
    onOpenChange?.(true);

    const contentEl = getContentEl();
    const triggerEl = getTriggerEl();
    if (!contentEl) return;

    if (positioning) {
      const ref = positioning.referenceElement ?? triggerEl ?? contentEl;
      const result = createFloatingPosition(ref, contentEl, positioning);
      state.floatingCleanup = result.cleanup;
      state.dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [ref, contentEl, ...(triggerEl ? [triggerEl] : [])],
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

  const ctx: DropdownMenuContextValue = {
    isOpen,
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
    <DropdownMenuContext.Provider value={ctx}>
      <span style="display: contents" data-dropdownmenu-root="">
        {children}
      </span>
    </DropdownMenuContext.Provider>
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
