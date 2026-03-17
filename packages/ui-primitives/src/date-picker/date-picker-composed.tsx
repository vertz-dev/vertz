/**
 * Composed DatePicker — declarative JSX component with trigger + popover + calendar.
 * Sub-components (Trigger, Content) self-wire via context.
 * Builds DOM directly rather than composing other composed primitives,
 * to avoid compiler reactive-wrapping issues with nested component calls.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { CalendarClasses, ComposedCalendarProps } from '../calendar/calendar-composed';
import { ComposedCalendar } from '../calendar/calendar-composed';
import { createDismiss } from '../utils/dismiss';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface DatePickerClasses {
  trigger?: string;
  content?: string;
  calendar?: CalendarClasses;
}

export type DatePickerClassKey = keyof DatePickerClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DatePickerContextValue {
  _registerTrigger: (children: ChildValue, cls?: string) => void;
  _registerContent: (children: ChildValue, cls?: string) => void;
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const DatePickerContext = createContext<DatePickerContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DatePickerContext',
);

function useDatePickerContext(componentName: string): DatePickerContextValue {
  const ctx = useContext(DatePickerContext);
  if (!ctx) {
    throw new Error(
      `<DatePicker.${componentName}> must be used inside <DatePicker>. ` +
        'Ensure it is a direct or nested child of the DatePicker root component.',
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DatePickerTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDatePickerContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <DatePicker.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerTrigger(children, effectiveCls);

  return (<span style="display: contents" />) as HTMLElement;
}

function DatePickerContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDatePickerContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <DatePicker.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Helpers (module-level — not inside component, avoids compiler transforms)
// ---------------------------------------------------------------------------

/**
 * Safely convert a value to a real Date.
 * `__list()` wraps items in reactive proxies — `instanceof Date` returns `false`
 * for these proxied values. This helper detects Date-like objects by duck-typing
 * `getTime()` and creates a fresh Date instance.
 */
function _toRealDate(val: unknown): Date | null {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && typeof (val as Date).getTime === 'function') {
    return new Date((val as Date).getTime());
  }
  return null;
}

function _defaultFormatDate(date: Date): string {
  return date.toLocaleDateString();
}

function _formatRangeDisplay(value: { from: Date; to: Date }, fmt: (date: Date) => string): string {
  return `${fmt(value.from)} – ${fmt(value.to)}`;
}

function _getDisplayText(
  value: Date | { from: Date; to: Date } | null,
  placeholder: string,
  formatDate: (date: Date) => string,
): string {
  if (value === null) return placeholder;
  if (value instanceof Date) return formatDate(value);
  if ('from' in value) return _formatRangeDisplay(value, formatDate);
  return placeholder;
}

/** Build the calendar element outside of the component to avoid compiler signal wrapping. */
function _buildCalendar(
  props: ComposedDatePickerProps,
  onCalendarValueChange: (value: Date | Date[] | { from: Date; to: Date } | null) => void,
): HTMLElement {
  const initValue = props.defaultValue ?? null;
  const calendarMode: ComposedCalendarProps['mode'] =
    (props.mode ?? 'single') === 'range' ? 'range' : 'single';
  const calendarDefaultValue =
    initValue instanceof Date
      ? initValue
      : initValue && 'from' in initValue
        ? initValue
        : undefined;
  const defaultMonth =
    props.defaultMonth ??
    (initValue instanceof Date
      ? initValue
      : initValue && 'from' in initValue
        ? initValue.from
        : new Date());

  return ComposedCalendar({
    classes: props.classes?.calendar,
    mode: calendarMode,
    defaultValue: calendarDefaultValue,
    defaultMonth,
    minDate: props.minDate,
    maxDate: props.maxDate,
    disabled: props.disabled,
    onValueChange: onCalendarValueChange,
  });
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedDatePickerProps {
  children?: ChildValue;
  classes?: DatePickerClasses;
  mode?: 'single' | 'range';
  defaultValue?: Date | { from: Date; to: Date };
  defaultMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  disabled?: (date: Date) => boolean;
  formatDate?: (date: Date) => string;
  placeholder?: string;
  onValueChange?: (value: Date | { from: Date; to: Date } | null) => void;
  onOpenChange?: (open: boolean) => void;
}

function ComposedDatePickerRoot({
  children,
  classes,
  mode = 'single',
  defaultValue = undefined,
  defaultMonth: defaultMonthProp,
  minDate,
  maxDate,
  disabled,
  formatDate = _defaultFormatDate,
  placeholder = 'Pick a date',
  onValueChange,
  onOpenChange,
}: ComposedDatePickerProps) {
  const ids = linkedIds('datepicker');

  // Registration storage — plain object avoids compiler signal transforms.
  // Also stores calendar build props to escape compiler computed wrapping.
  const reg: {
    triggerChildren: ChildValue;
    triggerCls: string | undefined;
    contentChildren: ChildValue;
    contentCls: string | undefined;
    dismissCleanup: (() => void) | null;
    calendarProps: ComposedDatePickerProps;
  } = {
    triggerChildren: undefined,
    triggerCls: undefined,
    contentChildren: undefined,
    contentCls: undefined,
    dismissCleanup: null,
    calendarProps: {
      mode,
      defaultValue,
      defaultMonth: defaultMonthProp,
      minDate,
      maxDate,
      disabled,
      classes,
    },
  };

  const ctxValue: DatePickerContextValue = {
    _registerTrigger: (triggerChildren, cls) => {
      reg.triggerChildren = triggerChildren;
      reg.triggerCls = cls;
    },
    _registerContent: (contentChildren, cls) => {
      reg.contentChildren = contentChildren;
      reg.contentCls = cls;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  DatePickerContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // State — plain object to avoid compiler signal transforms
  const state: {
    value: Date | { from: Date; to: Date } | null;
    isOpen: boolean;
  } = {
    value: defaultValue ?? null,
    isOpen: false,
  };

  // Build trigger element
  const triggerClass = [classes?.trigger, reg.triggerCls].filter(Boolean).join(' ');
  const initialText = _getDisplayText(state.value, placeholder, formatDate);

  const triggerEl = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls={ids.contentId}
      aria-expanded="false"
      data-state="closed"
      data-placeholder={state.value === null ? 'true' : undefined}
      class={triggerClass || undefined}
    >
      {initialText}
    </button>
  ) as HTMLButtonElement;

  // Content ref for DOM access
  const contentRef: Ref<HTMLDivElement> = ref();

  // Popover open/close logic
  function openPopover(): void {
    state.isOpen = true;
    triggerEl.setAttribute('aria-expanded', 'true');
    triggerEl.setAttribute('data-state', 'open');
    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.style.display = '';
      contentEl.setAttribute('aria-hidden', 'false');
      contentEl.setAttribute('data-state', 'open');
      reg.dismissCleanup = createDismiss({
        onDismiss: closePopover,
        insideElements: [triggerEl, contentEl],
        escapeKey: false,
      });
    }
    onOpenChange?.(true);
  }

  function closePopover(): void {
    state.isOpen = false;
    triggerEl.setAttribute('aria-expanded', 'false');
    triggerEl.setAttribute('data-state', 'closed');
    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.style.display = 'none';
      contentEl.setAttribute('aria-hidden', 'true');
      contentEl.setAttribute('data-state', 'closed');
    }
    reg.dismissCleanup?.();
    reg.dismissCleanup = null;
    onOpenChange?.(false);
  }

  function togglePopover(): void {
    if (state.isOpen) closePopover();
    else openPopover();
  }

  // Wire trigger click
  triggerEl.addEventListener('click', togglePopover);
  _tryOnCleanup(() => triggerEl.removeEventListener('click', togglePopover));

  function updateTriggerDisplay(): void {
    const text = _getDisplayText(state.value, placeholder, formatDate);
    triggerEl.textContent = text;
    if (state.value === null) {
      triggerEl.setAttribute('data-placeholder', 'true');
    } else {
      triggerEl.removeAttribute('data-placeholder');
    }
  }

  // Calendar value change handler
  // Note: `__list()` wraps items in reactive proxies, so `calValue` from the
  // calendar may be a Proxy rather than a real Date. Use `_toRealDate()` to
  // convert proxy-wrapped Dates into plain Date instances.
  function handleCalendarValueChange(
    calValue: Date | Date[] | { from: Date; to: Date } | null,
  ): void {
    if (calValue === null) return;

    if (mode === 'single') {
      const realDate = _toRealDate(calValue);
      if (realDate) {
        state.value = realDate;
        updateTriggerDisplay();
        onValueChange?.(realDate);
        closePopover();
      }
    } else if (mode === 'range' && 'from' in (calValue as object)) {
      const raw = calValue as { from: Date; to: Date };
      const from = _toRealDate(raw.from);
      const to = _toRealDate(raw.to);
      if (from && to) {
        const range = { from, to };
        state.value = range;
        updateTriggerDisplay();
        onValueChange?.(range);
        if (from.getTime() !== to.getTime()) {
          closePopover();
        }
      }
    }
  }

  // Build calendar — via module-level helper to prevent compiler computed wrapping.
  // Props are stored in `reg` (an object literal with explicit type) which the
  // compiler does NOT transform to reactive signals.
  const calendarEl = _buildCalendar(reg.calendarProps, handleCalendarValueChange);

  // Content class
  const contentClass = [classes?.content, reg.contentCls].filter(Boolean).join(' ');
  const extraContent = resolveChildren(reg.contentChildren);

  return (
    <div style="display: contents">
      {triggerEl}
      <div
        ref={contentRef}
        role="dialog"
        id={ids.contentId}
        aria-hidden="true"
        data-state="closed"
        style="display: none"
        class={contentClass || undefined}
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.Escape)) {
            event.preventDefault();
            closePopover();
          }
        }}
      >
        {calendarEl}
        {...extraContent}
      </div>
    </div>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedDatePicker = Object.assign(ComposedDatePickerRoot, {
  Trigger: DatePickerTrigger,
  Content: DatePickerContent,
}) as ((props: ComposedDatePickerProps) => HTMLElement) & {
  __classKeys?: DatePickerClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
