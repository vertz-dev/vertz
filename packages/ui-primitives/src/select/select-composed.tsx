/**
 * Composed Select — compound component with keyboard navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items discovered from the DOM via querySelectorAll.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
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
  isOpen: () => boolean;
  selectedValue: () => string;
  placeholder?: string;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: SelectClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectItem: (value: string) => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
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
  const displayText = children ?? (ctx.selectedValue() || ctx.placeholder || '');

  return (
    <button
      type="button"
      role="combobox"
      data-select-trigger=""
      aria-controls={ctx.contentId}
      aria-haspopup="listbox"
      aria-expanded="false"
      data-state="closed"
      class={combined || undefined}
      onClick={() => ctx.toggle()}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.ArrowUp, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!ctx.isOpen()) ctx.open();
        }
      }}
    >
      <span
        data-part="text"
        style="flex: 1; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
      >
        {displayText}
      </span>
      <span data-part="chevron">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
  );
}

function SelectContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSelectContext('Content');

  // Track content instances per Root for duplicate detection.
  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <Select.Content> detected \u2013 only the first is used');
  }

  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  // Wire keyboard handler on the connected content element.
  // Click selection is handled by SelectItem's inline onClick — no
  // delegated click handler here to avoid double selectItem() calls.
  onMount(() => {
    const el = ctx.contentRef.current as (HTMLDivElement & { __selectWired?: boolean }) | undefined;
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
  });

  return (
    <div
      ref={ctx.contentRef}
      role="listbox"
      tabindex="-1"
      id={ctx.contentId}
      data-select-content=""
      aria-hidden="true"
      data-state="closed"
      style="display: none"
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
  const isSelected = ctx.selectedValue() === value;

  return (
    <div
      role="option"
      data-value={value}
      tabindex="-1"
      aria-selected={isSelected ? 'true' : 'false'}
      data-state={isSelected ? 'active' : 'inactive'}
      class={itemClass || undefined}
      onClick={() => ctx.selectItem(value)}
    >
      {children ?? value}
      <span
        data-part="indicator"
        style={isSelected ? '' : 'display: none'}
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
  placeholder,
  onValueChange,
  positioning,
}: ComposedSelectProps) {
  const ids = linkedIds('select');
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;
  let selectedValue = defaultValue;

  const state: {
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = { floatingCleanup: null, dismissCleanup: null };

  function getContentEl(): HTMLElement | null {
    return contentRef.current ?? null;
  }

  function getTriggerEl(): HTMLElement | null {
    const content = getContentEl();
    return content?.parentElement?.querySelector('[data-select-trigger]') as HTMLElement | null;
  }

  function syncTriggerAttrs(nowOpen: boolean): void {
    const trigger = getTriggerEl();
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    trigger.setAttribute('data-state', nowOpen ? 'open' : 'closed');
  }

  function syncContentAttrs(nowOpen: boolean): void {
    const content = getContentEl();
    if (!content) return;
    content.setAttribute('data-state', nowOpen ? 'open' : 'closed');
    content.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');
    content.style.display = nowOpen ? '' : 'none';
  }

  function open(): void {
    isOpen = true;
    syncTriggerAttrs(true);
    syncContentAttrs(true);

    const contentEl = getContentEl();
    const triggerEl = getTriggerEl();
    if (!contentEl) return;

    // Always set up floating positioning (defaults to bottom-start, fixed).
    // Set position immediately to prevent layout shift before async computation.
    contentEl.style.position = 'fixed';
    if (triggerEl) {
      const floatingOpts = { matchReferenceWidth: true, ...positioning };
      const result = createFloatingPosition(triggerEl, contentEl, floatingOpts);
      state.floatingCleanup = result.cleanup;
    }

    // Always set up dismiss (click-outside + Escape key).
    const insideElements = [contentEl, ...(triggerEl ? [triggerEl] : [])];
    state.dismissCleanup = createDismiss({
      onDismiss: close,
      insideElements,
    });

    // Focus selected item or content
    const items = [...contentEl.querySelectorAll<HTMLElement>('[role="option"]')];
    const selectedIdx = items.findIndex((el) => el.getAttribute('data-value') === selectedValue);
    if (selectedIdx >= 0) {
      items.forEach((el, i) => el.setAttribute('tabindex', i === selectedIdx ? '0' : '-1'));
      items[selectedIdx]?.focus();
    } else {
      contentEl.focus();
    }
  }

  function close(): void {
    isOpen = false;
    syncTriggerAttrs(false);
    syncContentAttrs(false);

    // Reset floating position styles
    const contentEl = getContentEl();
    if (contentEl) {
      contentEl.style.position = '';
      contentEl.style.left = '';
      contentEl.style.top = '';
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
    isOpen: () => isOpen,
    selectedValue: () => selectedValue,
    placeholder,
    contentId: ids.contentId,
    contentRef,
    classes,
    open,
    close,
    toggle,
    selectItem,
    _contentCount: { value: 0 },
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
