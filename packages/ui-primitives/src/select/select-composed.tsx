/**
 * Composed Select — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items discovered from the DOM via querySelectorAll.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';
import { setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface SelectClasses {
  trigger?: string;
  content?: string;
  item?: string;
  itemIndicator?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SelectContextValue {
  isOpen: boolean;
  selectedValue: string;
  contentId: string;
  classes?: SelectClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectItem: (value: string) => void;
}

const SelectContext = createContext<SelectContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::SelectContext',
);

function useSelectContext(componentName: string): SelectContextValue {
  const ctx = useContext(SelectContext);
  if (!ctx) {
    throw new Error(
      `<Select.${componentName}> must be used inside <Select>. ` +
        'Ensure it is a direct or nested child of the Select root component.',
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

function SelectTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSelectContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="combobox"
      data-select-trigger=""
      aria-controls={ctx.contentId}
      aria-haspopup="listbox"
      aria-expanded={ctx.isOpen ? 'true' : 'false'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onClick={() => ctx.toggle()}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.ArrowUp, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!ctx.isOpen) ctx.open();
        }
      }}
    >
      {children ?? ctx.selectedValue}
      <span data-part="chevron" />
    </button>
  );
}

function SelectContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSelectContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  // Wire keyboard and click handlers on the connected content element.
  onMount(() => {
    const el = document.getElementById(ctx.contentId) as HTMLElement & { __selectWired?: boolean } | null;
    if (!el || el.__selectWired) return;
    el.__selectWired = true;

    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        ctx.close();
        return;
      }

      const items = [...el.querySelectorAll<HTMLElement>('[role="option"]')];
      const focusedIdx = items.indexOf(document.activeElement as HTMLElement);

      if (isKey(event, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        const active = items[focusedIdx];
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) ctx.selectItem(val);
        }
        return;
      }

      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) return;

      // Type-ahead
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const char = event.key.toLowerCase();
        const match = items.find((item) => item.textContent?.toLowerCase().startsWith(char));
        if (match) match.focus();
      }
    });

    el.addEventListener('click', (event: Event) => {
      const target = (event.target as HTMLElement).closest('[role="option"]');
      if (target) {
        const val = target.getAttribute('data-value');
        if (val !== null) ctx.selectItem(val);
      }
    });
  });

  return (
    <div
      role="listbox"
      tabindex="-1"
      id={ctx.contentId}
      data-select-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

function SelectItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useSelectContext('Item');
  const effectiveCls = cls ?? classProp;
  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="option"
      data-value={value}
      tabindex="-1"
      aria-selected={ctx.selectedValue === value ? 'true' : 'false'}
      data-state={ctx.selectedValue === value ? 'active' : 'inactive'}
      class={itemClass || undefined}
    >
      {children ?? value}
      <span
        data-part="indicator"
        style={ctx.selectedValue === value ? '' : 'display: none'}
        class={ctx.classes?.itemIndicator || undefined}
      />
    </div>
  );
}

function SelectGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useSelectContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      <div data-part="group-label" role="none" class={ctx.classes?.label || undefined}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SelectSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useSelectContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return <hr role="separator" class={sepClass || undefined} />;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedSelectProps {
  children?: ChildValue;
  classes?: SelectClasses;
  defaultValue?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  positioning?: FloatingOptions;
}

export type SelectClassKey = keyof SelectClasses;

function ComposedSelectRoot({
  children,
  classes,
  defaultValue = '',
  onValueChange,
  positioning,
}: ComposedSelectProps) {
  const ids = linkedIds('select');

  let isOpen = false;
  let selectedValue = defaultValue;

  const state: {
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { floatingCleanup: null, dismissCleanup: null };

  function getContentEl(): HTMLElement | null {
    return document.getElementById(ids.contentId);
  }

  function getTriggerEl(): HTMLElement | null {
    const content = getContentEl();
    return content?.parentElement?.querySelector('[data-select-trigger]') as HTMLElement | null;
  }

  function open(): void {
    isOpen = true;

    queueMicrotask(() => {
      const contentEl = getContentEl();
      const triggerEl = getTriggerEl();
      if (!contentEl) return;

      if (positioning && triggerEl) {
        const result = createFloatingPosition(triggerEl, contentEl, positioning);
        state.floatingCleanup = result.cleanup;
        state.dismissCleanup = createDismiss({
          onDismiss: close,
          insideElements: [triggerEl, contentEl],
          escapeKey: false,
        });
      }

      // Focus selected item or content
      const items = [...contentEl.querySelectorAll<HTMLElement>('[role="option"]')];
      const selectedIdx = items.findIndex(el => el.getAttribute('data-value') === selectedValue);
      if (selectedIdx >= 0) {
        items.forEach((el, i) => el.setAttribute('tabindex', i === selectedIdx ? '0' : '-1'));
        items[selectedIdx]?.focus();
      } else {
        contentEl.focus();
      }
    });
  }

  function close(): void {
    isOpen = false;

    const contentEl = getContentEl();
    if (contentEl) {
      contentEl.setAttribute('data-state', 'closed');
      setHiddenAnimated(contentEl, true);
    }

    state.floatingCleanup?.();
    state.floatingCleanup = null;
    state.dismissCleanup?.();
    state.dismissCleanup = null;

    getTriggerEl()?.focus();
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  function selectItem(value: string): void {
    selectedValue = value;
    onValueChange?.(value);
    close();
  }

  const ctx: SelectContextValue = {
    isOpen,
    selectedValue,
    contentId: ids.contentId,
    classes,
    open,
    close,
    toggle,
    selectItem,
  };

  return (
    <SelectContext.Provider value={ctx}>
      <span style="display: contents" data-select-root="">
        {children}
      </span>
    </SelectContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedSelect = Object.assign(ComposedSelectRoot, {
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Group: SelectGroup,
  Separator: SelectSeparator,
}) as ((props: ComposedSelectProps) => HTMLElement) & {
  __classKeys?: SelectClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
