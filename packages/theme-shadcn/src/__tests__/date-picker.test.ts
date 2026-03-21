import { describe, expect, it, vi } from 'bun:test';
import { createThemedDatePicker } from '../components/primitives/date-picker';
import { createCalendarStyles } from '../styles/calendar';
import { createDatePickerStyles } from '../styles/date-picker';

describe('date-picker styles', () => {
  const styles = createDatePickerStyles();

  it('has all expected blocks', () => {
    expect(typeof styles.trigger).toBe('string');
    expect(typeof styles.content).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(styles.trigger.length).toBeGreaterThan(0);
    expect(styles.content.length).toBeGreaterThan(0);
  });

  it('has combined CSS', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });

  it('trigger CSS sets explicit foreground color for text contrast', () => {
    const triggerClass = styles.trigger;
    const triggerRules = styles.css.split('}').filter((rule) => rule.includes(triggerClass));
    const triggerCSS = triggerRules.join('}');
    expect(triggerCSS).toMatch(/\bcolor:\s*var\(--color-foreground\)/);
  });
});

describe('themed DatePicker', () => {
  const styles = createDatePickerStyles();
  const calendarStyles = createCalendarStyles();

  it('applies trigger class to trigger button', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({ defaultMonth: new Date(2025, 5, 1) });
    document.body.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger.className).toContain(styles.trigger);

    document.body.removeChild(root);
  });

  it('applies content class to popover content', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({ defaultMonth: new Date(2025, 5, 1) });
    document.body.appendChild(root);

    const content = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(content.className).toContain(styles.content);

    document.body.removeChild(root);
  });

  it('contains calendar grid inside popover', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({ defaultMonth: new Date(2025, 5, 1) });
    document.body.appendChild(root);

    const grid = root.querySelector('[role="grid"]');
    expect(grid).not.toBeNull();

    document.body.removeChild(root);
  });

  it('has Trigger and Content sub-components', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    expect(typeof DatePicker.Trigger).toBe('function');
    expect(typeof DatePicker.Content).toBe('function');
  });

  it('calls onOpenChange when trigger is clicked', () => {
    const onOpenChange = vi.fn();
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({ onOpenChange, defaultMonth: new Date(2025, 5, 1) });
    document.body.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    document.body.removeChild(root);
  });

  it('forwards captionLayout="dropdown" to the inner calendar', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({
      captionLayout: 'dropdown',
      defaultMonth: new Date(2025, 5, 1),
      minDate: new Date(1926, 0, 1),
      maxDate: new Date(2026, 11, 31),
    });
    document.body.appendChild(root);

    const selects = root.querySelectorAll('select');
    expect(selects.length).toBe(2);
    const header = root.querySelector('[data-caption-layout="dropdown"]');
    expect(header).not.toBeNull();

    document.body.removeChild(root);
  });

  it('shows default placeholder text', () => {
    const DatePicker = createThemedDatePicker(styles, calendarStyles);
    const root = DatePicker({ defaultMonth: new Date(2025, 5, 1) });
    document.body.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger.textContent).toBe('Pick a date');

    document.body.removeChild(root);
  });
});
