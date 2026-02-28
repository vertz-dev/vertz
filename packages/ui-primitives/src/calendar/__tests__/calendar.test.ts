import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Calendar } from '../calendar';

describe('Calendar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('root grid has role="grid"', () => {
    const { grid } = Calendar.Root();
    expect(grid.getAttribute('role')).toBe('grid');
  });

  it('title shows correct month/year', () => {
    const { title } = Calendar.Root({ defaultMonth: new Date(2024, 5, 15) });
    expect(title.textContent).toBe('June 2024');
  });

  it('renders correct number of days for the month', () => {
    const { grid } = Calendar.Root({ defaultMonth: new Date(2024, 5, 1) }); // June 2024 has 30 days
    const dayButtons = grid.querySelectorAll('td button');
    // June 2024: starts on Saturday (6), 30 days
    // Grid should show all 30 days of June
    const juneDays = Array.from(dayButtons).filter(
      (btn) => btn.getAttribute('data-outside-month') !== 'true',
    );
    expect(juneDays.length).toBe(30);
  });

  it('arrow left/right moves focus by 1 day', () => {
    const { root, grid } = Calendar.Root({ defaultMonth: new Date(2024, 5, 1) });
    container.appendChild(root);

    const btn15 = grid.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
    btn15.focus();

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-16');

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-15');
  });

  it('arrow up/down moves focus by 7 days', () => {
    const { root, grid } = Calendar.Root({ defaultMonth: new Date(2024, 5, 1) });
    container.appendChild(root);

    const btn15 = grid.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
    btn15.focus();

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-22');

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-15');
  });

  it('PageUp/PageDown navigates months', () => {
    const { root, grid, title } = Calendar.Root({ defaultMonth: new Date(2024, 5, 15) });
    container.appendChild(root);

    const btn15 = grid.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
    btn15.focus();

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(title.textContent).toBe('July 2024');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-07-15');

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(title.textContent).toBe('June 2024');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-15');
  });

  it('Enter selects the focused date', () => {
    const { root, grid, state } = Calendar.Root({ defaultMonth: new Date(2024, 5, 1) });
    container.appendChild(root);

    const btn15 = grid.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
    btn15.focus();

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const val = state.value.peek() as Date;
    expect(val.getFullYear()).toBe(2024);
    expect(val.getMonth()).toBe(5);
    expect(val.getDate()).toBe(15);
  });

  it('selected date has aria-selected="true"', () => {
    const { root, grid } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 1),
      defaultValue: new Date(2024, 5, 10),
    });
    container.appendChild(root);

    const btn10 = grid.querySelector('button[data-date="2024-06-10"]') as HTMLButtonElement;
    expect(btn10.getAttribute('aria-selected')).toBe('true');

    const btn11 = grid.querySelector('button[data-date="2024-06-11"]') as HTMLButtonElement;
    expect(btn11.getAttribute('aria-selected')).toBeNull();
  });

  it('disabled dates have aria-disabled="true"', () => {
    const { grid } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 1),
      disabled: (date) => date.getDay() === 0, // disable Sundays
    });

    // June 2, 2024 is a Sunday
    const sundayBtn = grid.querySelector('button[data-date="2024-06-02"]') as HTMLButtonElement;
    expect(sundayBtn.getAttribute('aria-disabled')).toBe('true');

    // June 3, 2024 is a Monday
    const mondayBtn = grid.querySelector('button[data-date="2024-06-03"]') as HTMLButtonElement;
    expect(mondayBtn.getAttribute('aria-disabled')).toBeNull();
  });

  it('today has data-today="true"', () => {
    const today = new Date();
    const { grid } = Calendar.Root({ defaultMonth: today });

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const todayBtn = grid.querySelector(`button[data-date="${dateStr}"]`) as HTMLButtonElement;
    expect(todayBtn.getAttribute('data-today')).toBe('true');
  });

  it('prev/next buttons change month', () => {
    const { title, prevButton, nextButton } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 15),
    });

    expect(title.textContent).toBe('June 2024');

    nextButton.click();
    expect(title.textContent).toBe('July 2024');

    prevButton.click();
    expect(title.textContent).toBe('June 2024');

    prevButton.click();
    expect(title.textContent).toBe('May 2024');
  });

  it('calls onValueChange when a date is clicked', () => {
    const onValueChange = vi.fn();
    const { root, grid } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 1),
      onValueChange,
    });
    container.appendChild(root);

    const btn10 = grid.querySelector('button[data-date="2024-06-10"]') as HTMLButtonElement;
    btn10.click();

    expect(onValueChange).toHaveBeenCalledTimes(1);
    const val = onValueChange.mock.calls[0]?.[0] as Date;
    expect(val.getDate()).toBe(10);
  });

  it('calls onMonthChange when month changes', () => {
    const onMonthChange = vi.fn();
    const { nextButton, prevButton } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 15),
      onMonthChange,
    });

    nextButton.click();
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    const val = onMonthChange.mock.calls[0]?.[0] as Date;
    expect(val.getMonth()).toBe(6); // July

    prevButton.click();
    expect(onMonthChange).toHaveBeenCalledTimes(2);
  });

  it('range mode sets data-range-start and data-range-end', () => {
    const { root, grid } = Calendar.Root({
      mode: 'range',
      defaultMonth: new Date(2024, 5, 1),
      defaultValue: { from: new Date(2024, 5, 10), to: new Date(2024, 5, 15) },
    });
    container.appendChild(root);

    const btnStart = grid.querySelector('button[data-date="2024-06-10"]') as HTMLButtonElement;
    const btnEnd = grid.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
    const btnMiddle = grid.querySelector('button[data-date="2024-06-12"]') as HTMLButtonElement;

    expect(btnStart.getAttribute('data-range-start')).toBe('true');
    expect(btnEnd.getAttribute('data-range-end')).toBe('true');
    expect(btnMiddle.getAttribute('data-in-range')).toBe('true');
  });

  it('minDate/maxDate disable out-of-range dates', () => {
    const { grid } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 1),
      minDate: new Date(2024, 5, 5),
      maxDate: new Date(2024, 5, 25),
    });

    const btn4 = grid.querySelector('button[data-date="2024-06-04"]') as HTMLButtonElement;
    expect(btn4.getAttribute('aria-disabled')).toBe('true');

    const btn5 = grid.querySelector('button[data-date="2024-06-05"]') as HTMLButtonElement;
    expect(btn5.getAttribute('aria-disabled')).toBeNull();

    const btn25 = grid.querySelector('button[data-date="2024-06-25"]') as HTMLButtonElement;
    expect(btn25.getAttribute('aria-disabled')).toBeNull();

    const btn26 = grid.querySelector('button[data-date="2024-06-26"]') as HTMLButtonElement;
    expect(btn26.getAttribute('aria-disabled')).toBe('true');
  });

  it('column headers show day abbreviations', () => {
    const { grid } = Calendar.Root({ defaultMonth: new Date(2024, 5, 1) });
    const headers = grid.querySelectorAll('th');
    expect(headers.length).toBe(7);
    const dayTexts = Array.from(headers).map((th) => th.textContent);
    expect(dayTexts).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('column headers respect weekStartsOn', () => {
    const { grid } = Calendar.Root({
      defaultMonth: new Date(2024, 5, 1),
      weekStartsOn: 1, // Monday
    });
    const headers = grid.querySelectorAll('th');
    const dayTexts = Array.from(headers).map((th) => th.textContent);
    expect(dayTexts).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });
});
