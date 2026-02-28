import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { resetIdCounter } from '../../utils/id';
import { DatePicker } from '../date-picker';

describe('DatePicker', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    resetIdCounter();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates trigger and content elements', () => {
    const result = DatePicker.Root();
    expect(result.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
  });

  it('trigger shows placeholder by default', () => {
    const result = DatePicker.Root({ placeholder: 'Select date' });
    expect(result.trigger.textContent).toBe('Select date');
    expect(result.trigger.getAttribute('data-placeholder')).toBe('true');
  });

  it('trigger shows default placeholder when none provided', () => {
    const result = DatePicker.Root();
    expect(result.trigger.textContent).toBe('Pick a date');
  });

  it('trigger shows formatted date when defaultValue is set', () => {
    const date = new Date(2025, 0, 15);
    const result = DatePicker.Root({
      defaultValue: date,
      formatDate: (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    });
    expect(result.trigger.textContent).toBe('2025-01-15');
    expect(result.trigger.getAttribute('data-placeholder')).toBeNull();
  });

  it('content contains calendar grid with role="grid"', () => {
    const result = DatePicker.Root();
    expect(result.calendar.grid.getAttribute('role')).toBe('grid');
  });

  it('content contains calendar elements', () => {
    const result = DatePicker.Root();
    expect(result.calendar.root).toBeInstanceOf(HTMLDivElement);
    expect(result.calendar.header).toBeInstanceOf(HTMLDivElement);
    expect(result.calendar.title).toBeInstanceOf(HTMLDivElement);
    expect(result.calendar.prevButton).toBeInstanceOf(HTMLButtonElement);
    expect(result.calendar.nextButton).toBeInstanceOf(HTMLButtonElement);
    expect(result.calendar.grid).toBeInstanceOf(HTMLTableElement);
  });

  it('trigger has aria-haspopup="dialog"', () => {
    const result = DatePicker.Root();
    expect(result.trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('trigger has aria-expanded attribute', () => {
    const result = DatePicker.Root();
    expect(result.trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking trigger opens popover', () => {
    const result = DatePicker.Root();
    container.appendChild(result.trigger);
    container.appendChild(result.content);
    result.trigger.click();
    expect(result.state.open.peek()).toBe(true);
    expect(result.trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onOpenChange when opened', () => {
    const onOpenChange = vi.fn();
    const result = DatePicker.Root({ onOpenChange });
    container.appendChild(result.trigger);
    container.appendChild(result.content);
    result.trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('single mode: selecting a date closes popover and updates trigger', () => {
    const onValueChange = vi.fn();
    const result = DatePicker.Root({
      defaultMonth: new Date(2025, 5, 1),
      formatDate: (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      onValueChange,
    });
    container.appendChild(result.trigger);
    container.appendChild(result.content);

    // Open the popover
    result.trigger.click();
    expect(result.state.open.peek()).toBe(true);

    // Find a day button for the 15th of the displayed month
    const dayButtons = result.calendar.grid.querySelectorAll('button');
    const dayBtn = Array.from(dayButtons).find(
      (btn) => btn.textContent === '15' && btn.getAttribute('data-outside-month') !== 'true',
    );
    expect(dayBtn).not.toBeNull();
    (dayBtn as HTMLButtonElement).click();

    expect(onValueChange).toHaveBeenCalled();
    const selectedDate = onValueChange.mock.calls[0]?.[0] as Date;
    expect(selectedDate.getDate()).toBe(15);

    // Popover should be closed
    expect(result.state.open.peek()).toBe(false);
    // Trigger text should be updated
    expect(result.trigger.textContent).toContain('15');
  });

  it('custom formatDate is used', () => {
    const date = new Date(2025, 11, 25);
    const result = DatePicker.Root({
      defaultValue: date,
      formatDate: () => 'Christmas!',
    });
    expect(result.trigger.textContent).toBe('Christmas!');
  });

  it('show() and hide() programmatic control', () => {
    const result = DatePicker.Root();
    container.appendChild(result.trigger);
    container.appendChild(result.content);

    result.show();
    expect(result.state.open.peek()).toBe(true);

    result.hide();
    expect(result.state.open.peek()).toBe(false);
  });

  it('hide() is no-op when already closed', () => {
    const result = DatePicker.Root();
    container.appendChild(result.trigger);
    container.appendChild(result.content);
    expect(result.state.open.peek()).toBe(false);
    result.hide();
    expect(result.state.open.peek()).toBe(false);
  });

  it('Escape key closes popover', () => {
    const result = DatePicker.Root();
    container.appendChild(result.trigger);
    container.appendChild(result.content);

    result.trigger.click();
    expect(result.state.open.peek()).toBe(true);

    result.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(result.state.open.peek()).toBe(false);
  });

  it('range mode: shows range display', () => {
    const from = new Date(2025, 0, 10);
    const to = new Date(2025, 0, 20);
    const result = DatePicker.Root({
      mode: 'range',
      defaultValue: { from, to },
      formatDate: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    });
    expect(result.trigger.textContent).toBe('1/10 – 1/20');
  });

  it('displayMonth state reflects calendar month', () => {
    const result = DatePicker.Root({
      defaultMonth: new Date(2025, 3, 1),
    });
    const month = result.state.displayMonth.peek();
    expect(month.getMonth()).toBe(3);
    expect(month.getFullYear()).toBe(2025);
  });
});
