import { describe, expect, it } from 'bun:test';
import { createThemedDatePicker } from '../components/primitives/date-picker';
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
});

describe('themed DatePicker', () => {
  const styles = createDatePickerStyles();
  const datePicker = createThemedDatePicker(styles);

  it('applies trigger class', () => {
    const result = datePicker();
    expect(result.trigger.className).toContain(styles.trigger);
  });

  it('applies content class', () => {
    const result = datePicker();
    expect(result.content.className).toContain(styles.content);
  });

  it('contains calendar grid', () => {
    const result = datePicker();
    expect(result.calendar.grid.getAttribute('role')).toBe('grid');
  });
});
