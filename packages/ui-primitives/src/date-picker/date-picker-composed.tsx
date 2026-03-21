/**
 * Composed DatePicker — compound component with trigger + popover + calendar.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 *
 * Note: Calls ComposedCalendar() as a function (not JSX) to avoid compiler
 * reactive-wrapping issues with nested component calls.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
import type { CalendarClasses, ComposedCalendarProps } from '../calendar/calendar-composed';
import { cn } from '../composed/cn';
import { ComposedCalendar } from '../calendar/calendar-composed';
import { createDismiss } from '../utils/dismiss';
import { linkedIds } from '../utils/id';

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
  /** Function getters to avoid static signal capture in context. */
  isOpen: () => boolean;
  hasValue: () => boolean;
  displayText: () => string;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: DatePickerClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const DatePickerContext = createContext<DatePickerContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DatePickerContext',
);

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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function DatePickerTrigger({ children, className: cls, class: classProp }: SlotProps) {
  // Use useContext() directly so the compiler recognizes ctx as reactive,
  // wrapping derived const variables in computed() → reactive __attr.
  const ctx = useContext(DatePickerContext);
  if (!ctx) {
    throw new Error(
      '<DatePicker.Trigger> must be used inside <DatePicker>. ' +
        'Ensure it is a direct or nested child of the DatePicker root component.',
    );
  }
  const isOpen = ctx.isOpen();
  const hasVal = ctx.hasValue();
  const text = ctx.displayText();

  return (
    <button
      type="button"
      data-datepicker-trigger=""
      aria-haspopup="dialog"
      aria-controls={ctx.contentId}
      aria-expanded={isOpen ? 'true' : 'false'}
      data-state={isOpen ? 'open' : 'closed'}
      data-placeholder={hasVal ? undefined : 'true'}
      class={cn(ctx.classes?.trigger, cls ?? classProp)}
      onClick={() => ctx.toggle()}
    >
      {children ?? text}
    </button>
  );
}

function DatePickerContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useContext(DatePickerContext);
  if (!ctx) {
    throw new Error(
      '<DatePicker.Content> must be used inside <DatePicker>. ' +
        'Ensure it is a direct or nested child of the DatePicker root component.',
    );
  }
  const isOpen = ctx.isOpen();

  return (
    <div
      ref={ctx.contentRef}
      role="dialog"
      id={ctx.contentId}
      data-datepicker-content=""
      aria-hidden={isOpen ? 'false' : 'true'}
      data-state={isOpen ? 'open' : 'closed'}
      style={{ display: isOpen ? '' : 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (module-level — not inside component, avoids compiler transforms)
// ---------------------------------------------------------------------------

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

function _getDisplayText(
  value: Date | { from: Date; to: Date } | null,
  placeholder: string,
  formatDate: (date: Date) => string,
): string {
  if (value === null) return placeholder;
  if (value instanceof Date) return formatDate(value);
  if ('from' in value) return `${formatDate(value.from)} – ${formatDate(value.to)}`;
  return placeholder;
}

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
    captionLayout: props.captionLayout,
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
  captionLayout?: ComposedCalendarProps['captionLayout'];
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
  captionLayout,
}: ComposedDatePickerProps) {
  const ids = linkedIds('datepicker');
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;
  let hasValue = defaultValue != null;
  let displayText = _getDisplayText(defaultValue ?? null, placeholder, formatDate);

  // Plain object for non-reactive state.
  const state: {
    value: Date | { from: Date; to: Date } | null;
    dismissCleanup: (() => void) | null;
  } = {
    value: defaultValue ?? null,
    dismissCleanup: null,
  };

  // Wire dismiss handler on connected content element.
  onMount(() => {
    const open = isOpen;
    if (!open) return;

    const contentEl = contentRef.current;
    const triggerEl = contentEl?.parentElement?.querySelector(
      '[data-datepicker-trigger]',
    ) as HTMLElement | null;
    if (!contentEl) return;

    state.dismissCleanup = createDismiss({
      onDismiss: close,
      insideElements: [contentEl, ...(triggerEl ? [triggerEl] : [])],
      escapeKey: true,
    });
  });

  function open(): void {
    isOpen = true;
    onOpenChange?.(true);
  }

  function close(): void {
    isOpen = false;
    state.dismissCleanup?.();
    state.dismissCleanup = null;
    onOpenChange?.(false);
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  function handleCalendarValueChange(
    calValue: Date | Date[] | { from: Date; to: Date } | null,
  ): void {
    if (calValue === null) return;

    if (mode === 'single') {
      const realDate = _toRealDate(calValue);
      if (realDate) {
        state.value = realDate;
        hasValue = true;
        displayText = _getDisplayText(realDate, placeholder, formatDate);
        onValueChange?.(realDate);
        close();
      }
    } else if (mode === 'range' && calValue && 'from' in (calValue as object)) {
      const raw = calValue as { from: Date; to: Date };
      const from = _toRealDate(raw.from);
      const to = _toRealDate(raw.to);
      if (from && to) {
        const range = { from, to };
        state.value = range;
        hasValue = true;
        displayText = _getDisplayText(range, placeholder, formatDate);
        onValueChange?.(range);
        if (from.getTime() !== to.getTime()) {
          close();
        }
      }
    }
  }

  // Build calendar via module-level helper to prevent compiler computed wrapping.
  const calendarEl = _buildCalendar(
    {
      mode,
      defaultValue,
      defaultMonth: defaultMonthProp,
      minDate,
      maxDate,
      disabled,
      classes,
      captionLayout,
    },
    handleCalendarValueChange,
  );

  const ctx: DatePickerContextValue = {
    isOpen: () => isOpen,
    hasValue: () => hasValue,
    displayText: () => displayText,
    contentId: ids.contentId,
    contentRef,
    classes,
    open,
    close,
    toggle,
  };

  return (
    <DatePickerContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-datepicker-root="">
        {children ?? (
          <>
            <DatePickerTrigger />
            <DatePickerContent>{calendarEl}</DatePickerContent>
          </>
        )}
      </span>
    </DatePickerContext.Provider>
  );
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
