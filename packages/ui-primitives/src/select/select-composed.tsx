/**
 * Composed Select — high-level composable component with fully declarative JSX.
 * Sub-components self-wire via context. No factory dependency.
 *
 * Compiler constraints applied:
 * - `const reg` object for registration (not `let` — avoids signal transforms)
 * - `buildSelectCtx()` helper outside component for context value construction
 * - `buildItemEl()` outside component body to avoid computed() on JSX returns
 * - `for` loops instead of `.map()` at top level
 * - Content panel as separate JSX variable for event delegation cleanup
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
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
// Registration types
// ---------------------------------------------------------------------------

interface ItemRegistration {
  el: HTMLDivElement;
  value: string;
}

interface SelectReg {
  items: ItemRegistration[];
  contentChildren: Node[];
  contentClass: string | undefined;
  floatingCleanup: (() => void) | null;
  dismissCleanup: (() => void) | null;
  selectedValue: string;
  isOpen: boolean;
  activeIndex: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SelectContextValue {
  classes?: SelectClasses;
  /** Register an item element + value for keyboard nav */
  _registerItem: (el: HTMLDivElement, value: string) => void;
  /** Register the content's children and class */
  _registerContent: (contentChildren: Node[], cls?: string) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Helper: create reg object outside component body
// (avoids compiler wrapping object literal in computed())
// ---------------------------------------------------------------------------

function createSelectReg(defaultValue: string): SelectReg {
  return {
    items: [],
    contentChildren: [],
    contentClass: undefined,
    floatingCleanup: null,
    dismissCleanup: null,
    selectedValue: defaultValue,
    isOpen: false,
    activeIndex: -1,
  };
}

// ---------------------------------------------------------------------------
// Helper: build context value outside component body
// (avoids compiler wrapping object literal in computed())
// ---------------------------------------------------------------------------

function buildSelectCtx(
  classes: SelectClasses | undefined,
  registerItem: (el: HTMLDivElement, value: string) => void,
  registerContent: (contentChildren: Node[], cls?: string) => void,
): SelectContextValue {
  return {
    classes,
    _registerItem: registerItem,
    _registerContent: registerContent,
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

// ---------------------------------------------------------------------------
// Helper: build item element outside component body
// (avoids compiler classifying JSX return as computed())
// ---------------------------------------------------------------------------

function buildItemEl(
  value: string,
  isSelected: boolean,
  label: string,
  itemClass: string,
  indicatorClass: string | undefined,
): HTMLDivElement {
  const el = (
    <div
      role="option"
      data-value={value}
      tabindex="-1"
      aria-selected={isSelected ? 'true' : 'false'}
      data-state={isSelected ? 'active' : 'inactive'}
    >
      {label}
      <span data-part="indicator" style="display: none" class={indicatorClass || undefined} />
    </div>
  ) as HTMLDivElement;

  if (itemClass) el.className = itemClass;

  return el;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function SelectTrigger(_props: SlotProps) {
  const ctx = useSelectContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Select.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  // Return nothing — Root builds the actual trigger element
  return (<span style="display: none" />) as HTMLElement;
}

function SelectContent({ children }: SlotProps) {
  const ctx = useSelectContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Select.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  // Resolve children (Items, Groups, Separators) for their registration side effects
  const resolved = resolveChildren(children);
  ctx._registerContent(resolved);

  // Return nothing — Root builds the actual content element
  return (<span style="display: none" />) as HTMLElement;
}

function SelectItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const ctx = useSelectContext('Item');
  const effectiveCls = cls ?? classProp;

  // Extract label from children
  const resolved = resolveChildren(children);
  const label = resolved
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();

  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');

  // Build element using standalone helper to avoid computed() wrapping
  // Click handler wired by Root after items are collected
  const el = buildItemEl(
    value,
    false, // selection state set by Root after all items are registered
    label || value,
    itemClass,
    ctx.classes?.itemIndicator,
  );

  ctx._registerItem(el, value);

  return el;
}

function SelectGroup({ label, children, className: cls, class: classProp }: GroupProps) {
  const ctx = useSelectContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');

  // Resolve children within context so nested Items register themselves
  const resolved = resolveChildren(children);

  const labelClass = ctx.classes?.label;

  const el = (
    <div role="group" aria-label={label} class={groupClass || undefined}>
      <div data-part="group-label" role="none" class={labelClass || undefined}>
        {label}
      </div>
      {...resolved}
    </div>
  ) as HTMLDivElement;

  return el;
}

function SelectSeparator({ className: cls, class: classProp }: SlotProps) {
  const { classes } = useSelectContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [classes?.separator, effectiveCls].filter(Boolean).join(' ');

  return (<hr role="separator" class={sepClass || undefined} />) as HTMLHRElement;
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
  placeholder = '',
  onValueChange,
  positioning,
}: ComposedSelectProps) {
  const ids = linkedIds('select');

  // Plain reg object — NOT `let` variables (compiler would transform to signals)
  // Created via helper function to avoid compiler wrapping object literal in computed()
  const reg = createSelectReg(defaultValue);

  // --- Helper functions that close over reg ---

  function updateActiveItem(index: number): void {
    for (let i = 0; i < reg.items.length; i++) {
      const item = reg.items[i];
      if (item) {
        item.el.setAttribute('tabindex', i === index ? '0' : '-1');
      }
    }
  }

  function selectItem(value: string): void {
    reg.selectedValue = value;
    for (let i = 0; i < reg.items.length; i++) {
      const item = reg.items[i];
      if (!item) continue;
      const isActive = item.value === value;
      item.el.setAttribute('aria-selected', isActive ? 'true' : 'false');
      item.el.setAttribute('data-state', isActive ? 'active' : 'inactive');
      if (isActive) {
        triggerText.textContent = item.el.textContent ?? value;
      }
    }
    onValueChange?.(value);
    close();
  }

  function open(): void {
    reg.isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('data-state', 'open');
    contentPanel.setAttribute('aria-hidden', 'false');
    contentPanel.setAttribute('data-state', 'open');
    contentPanel.style.display = '';

    if (positioning) {
      const result = createFloatingPosition(trigger, contentPanel, positioning);
      reg.floatingCleanup = result.cleanup;
      reg.dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [trigger, contentPanel],
        escapeKey: false,
      });
    } else {
      const rect = trigger.getBoundingClientRect();
      const side = window.innerHeight - rect.bottom >= rect.top ? 'bottom' : 'top';
      contentPanel.setAttribute('data-side', side);
    }

    // Focus selected item or content
    let selectedIdx = -1;
    for (let i = 0; i < reg.items.length; i++) {
      if (reg.items[i]?.value === reg.selectedValue) {
        selectedIdx = i;
        break;
      }
    }
    if (selectedIdx >= 0) {
      reg.activeIndex = selectedIdx;
      updateActiveItem(selectedIdx);
      reg.items[selectedIdx]?.el.focus();
    } else {
      reg.activeIndex = -1;
      updateActiveItem(-1);
      contentPanel.focus();
    }
  }

  function close(): void {
    reg.isOpen = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('data-state', 'closed');
    contentPanel.setAttribute('data-state', 'closed');
    contentPanel.setAttribute('aria-hidden', 'true');
    setHiddenAnimated(contentPanel, true);
    reg.floatingCleanup?.();
    reg.floatingCleanup = null;
    reg.dismissCleanup?.();
    reg.dismissCleanup = null;
    trigger.focus();
  }

  // --- Build context and resolve children (Phase 1) ---

  const ctxValue = buildSelectCtx(
    classes,
    (el: HTMLDivElement, value: string) => {
      reg.items.push({ el, value });
    },
    (contentChildren: Node[], cls?: string) => {
      reg.contentChildren = contentChildren;
      reg.contentClass = cls;
    },
  );

  SelectContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // --- Wire item click handlers now that selectItem is defined ---

  for (let i = 0; i < reg.items.length; i++) {
    const item = reg.items[i];
    if (!item) continue;
    const itemValue = item.value;
    const handleItemClick = () => {
      selectItem(itemValue);
    };
    item.el.addEventListener('click', handleItemClick);
    _tryOnCleanup(() => item.el.removeEventListener('click', handleItemClick));
  }

  // --- Set initial selection state on items ---

  if (defaultValue) {
    for (let i = 0; i < reg.items.length; i++) {
      const item = reg.items[i];
      if (!item) continue;
      const isSelected = item.value === defaultValue;
      item.el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      item.el.setAttribute('data-state', isSelected ? 'active' : 'inactive');
    }
  }

  // --- Build trigger ---

  const triggerText = (
    <span data-part="value">{defaultValue || placeholder}</span>
  ) as HTMLSpanElement;

  // Set trigger text to selected item's label if defaultValue matches
  if (defaultValue) {
    for (let i = 0; i < reg.items.length; i++) {
      const item = reg.items[i];
      if (item && item.value === defaultValue) {
        triggerText.textContent = item.el.textContent ?? defaultValue;
        break;
      }
    }
  }

  const chevron = (<span data-part="chevron" />) as HTMLSpanElement;

  const trigger = (
    <button
      type="button"
      role="combobox"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-haspopup="listbox"
      aria-expanded="false"
      data-state="closed"
      class={classes?.trigger || undefined}
      onClick={() => {
        if (reg.isOpen) {
          close();
        } else {
          open();
        }
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.ArrowUp, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!reg.isOpen) {
            open();
          }
        }
      }}
    >
      {triggerText}
      {chevron}
    </button>
  ) as HTMLButtonElement;

  // --- Build content panel ---

  const contentPanel = (
    <div
      role="listbox"
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

  // Wire keyboard handlers via addEventListener for cleanup
  const handleContentKeydown = (event: KeyboardEvent) => {
    if (isKey(event, Keys.Escape)) {
      event.preventDefault();
      close();
      return;
    }

    if (isKey(event, Keys.Enter, Keys.Space)) {
      event.preventDefault();
      const active = reg.items[reg.activeIndex];
      if (active) {
        selectItem(active.value);
      }
      return;
    }

    if (reg.activeIndex === -1) {
      if (isKey(event, Keys.ArrowDown)) {
        event.preventDefault();
        reg.activeIndex = 0;
        updateActiveItem(0);
        reg.items[0]?.el.focus();
        return;
      }
      if (isKey(event, Keys.ArrowUp)) {
        event.preventDefault();
        const last = reg.items.length - 1;
        reg.activeIndex = last;
        updateActiveItem(last);
        reg.items[last]?.el.focus();
        return;
      }
    }

    const itemEls: HTMLElement[] = [];
    for (let i = 0; i < reg.items.length; i++) {
      const item = reg.items[i];
      if (item) itemEls.push(item.el);
    }

    const result = handleListNavigation(event, itemEls, { orientation: 'vertical' });
    if (result) {
      for (let i = 0; i < reg.items.length; i++) {
        if (reg.items[i]?.el === result) {
          reg.activeIndex = i;
          updateActiveItem(i);
          break;
        }
      }
      return;
    }

    // Type-ahead: single-char search
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const char = event.key.toLowerCase();
      for (let i = 0; i < reg.items.length; i++) {
        const item = reg.items[i];
        if (item?.el.textContent?.toLowerCase().startsWith(char)) {
          reg.activeIndex = i;
          updateActiveItem(i);
          item.el.focus();
          break;
        }
      }
    }
  };

  contentPanel.addEventListener('keydown', handleContentKeydown);
  _tryOnCleanup(() => contentPanel.removeEventListener('keydown', handleContentKeydown));

  return (
    <div style="display: contents">
      {trigger}
      {contentPanel}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
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
