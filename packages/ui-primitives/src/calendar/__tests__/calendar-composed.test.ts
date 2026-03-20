import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedCalendar } from '../calendar-composed';

describe('Composed Calendar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedCalendar with classes', () => {
    describe('When rendered', () => {
      it('Then applies root class to the container', () => {
        const root = ComposedCalendar({
          classes: { root: 'cal-root' },
          defaultMonth: new Date(2024, 5, 1),
        });
        expect(root.className).toContain('cal-root');
      });

      it('Then creates a grid with role="grid" and applies grid class', () => {
        const root = ComposedCalendar({
          classes: { grid: 'cal-grid' },
          defaultMonth: new Date(2024, 5, 1),
        });
        const grid = root.querySelector('[role="grid"]');
        expect(grid).not.toBeNull();
        expect(grid?.className).toContain('cal-grid');
      });

      it('Then applies header, title, and navButton classes', () => {
        const root = ComposedCalendar({
          classes: { header: 'cal-hdr', title: 'cal-ttl', navButton: 'cal-nav' },
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);

        const buttons = root.querySelectorAll('button');
        // First two buttons are nav buttons (prev/next), before the grid buttons
        const navButtons = Array.from(buttons).filter((b) => !b.hasAttribute('data-date'));
        expect(navButtons.length).toBe(2);
        expect(navButtons[0]?.className).toContain('cal-nav');
        expect(navButtons[1]?.className).toContain('cal-nav');
      });

      it('Then applies headCell, cell, and dayButton classes', () => {
        const root = ComposedCalendar({
          classes: { headCell: 'cal-hc', cell: 'cal-c', dayButton: 'cal-db' },
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);

        const ths = root.querySelectorAll('th');
        expect(ths.length).toBe(7);
        expect(ths[0]?.className).toContain('cal-hc');

        const tds = root.querySelectorAll('td');
        expect(tds.length).toBeGreaterThan(0);
        expect(tds[0]?.className).toContain('cal-c');

        const dayBtns = root.querySelectorAll('td button');
        expect(dayBtns.length).toBeGreaterThan(0);
        expect(dayBtns[0]?.className).toContain('cal-db');
      });
    });
  });

  describe('Given a ComposedCalendar with defaultMonth', () => {
    describe('When rendered', () => {
      it('Then shows correct month/year in title', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 15) });
        container.appendChild(root);
        const title = root.querySelector('div > div > div');
        expect(title?.textContent).toContain('June 2024');
      });

      it('Then renders correct number of days for the month', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);
        const dayButtons = root.querySelectorAll('td button');
        const juneDays = Array.from(dayButtons).filter(
          (btn) => btn.getAttribute('data-outside-month') !== 'true',
        );
        expect(juneDays.length).toBe(30);
      });

      it('Then shows column headers with day abbreviations', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);
        const headers = root.querySelectorAll('th');
        expect(headers.length).toBe(7);
        const dayTexts = Array.from(headers).map((th) => th.textContent);
        expect(dayTexts).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
      });

      it('Then respects weekStartsOn for column headers', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          weekStartsOn: 1,
        });
        container.appendChild(root);
        const headers = root.querySelectorAll('th');
        const dayTexts = Array.from(headers).map((th) => th.textContent);
        expect(dayTexts).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
      });
    });
  });

  describe('Given a ComposedCalendar with defaultValue', () => {
    describe('When rendered', () => {
      it('Then marks the selected date with aria-selected', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          defaultValue: new Date(2024, 5, 10),
        });
        container.appendChild(root);

        const btn10 = root.querySelector('button[data-date="2024-06-10"]');
        expect(btn10?.getAttribute('aria-selected')).toBe('true');

        const btn11 = root.querySelector('button[data-date="2024-06-11"]');
        expect(btn11?.getAttribute('aria-selected')).toBeNull();
      });
    });
  });

  describe('Given a ComposedCalendar with today visible', () => {
    describe('When rendered', () => {
      it('Then marks today with data-today="true"', () => {
        const today = new Date();
        const root = ComposedCalendar({ defaultMonth: today });
        container.appendChild(root);

        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const todayBtn = root.querySelector(`button[data-date="${dateStr}"]`);
        expect(todayBtn?.getAttribute('data-today')).toBe('true');
      });
    });
  });

  describe('Given a ComposedCalendar with disabled dates', () => {
    describe('When rendered', () => {
      it('Then marks disabled dates with aria-disabled', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          disabled: (date) => date.getDay() === 0,
        });
        container.appendChild(root);

        const sundayBtn = root.querySelector('button[data-date="2024-06-02"]');
        expect(sundayBtn?.getAttribute('aria-disabled')).toBe('true');

        const mondayBtn = root.querySelector('button[data-date="2024-06-03"]');
        expect(mondayBtn?.getAttribute('aria-disabled')).toBeNull();
      });
    });
  });

  describe('Given a ComposedCalendar with minDate/maxDate', () => {
    describe('When rendered', () => {
      it('Then disables out-of-range dates', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2024, 5, 5),
          maxDate: new Date(2024, 5, 25),
        });
        container.appendChild(root);

        const btn4 = root.querySelector('button[data-date="2024-06-04"]');
        expect(btn4?.getAttribute('aria-disabled')).toBe('true');

        const btn5 = root.querySelector('button[data-date="2024-06-05"]');
        expect(btn5?.getAttribute('aria-disabled')).toBeNull();

        const btn25 = root.querySelector('button[data-date="2024-06-25"]');
        expect(btn25?.getAttribute('aria-disabled')).toBeNull();

        const btn26 = root.querySelector('button[data-date="2024-06-26"]');
        expect(btn26?.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });

  describe('Given a ComposedCalendar with nav buttons', () => {
    describe('When rendered', () => {
      it('Then nav buttons contain chevron SVG icons', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 15),
        });
        container.appendChild(root);

        const navButtons = Array.from(root.querySelectorAll('button')).filter(
          (b) => !b.hasAttribute('data-date'),
        );
        expect(navButtons.length).toBe(2);

        const prevSvg = navButtons[0]?.querySelector('svg');
        const nextSvg = navButtons[1]?.querySelector('svg');
        expect(prevSvg).not.toBeNull();
        expect(nextSvg).not.toBeNull();
        expect(prevSvg?.getAttribute('aria-hidden')).toBe('true');
        expect(nextSvg?.getAttribute('aria-hidden')).toBe('true');
      });
    });

    describe('When clicking prev/next buttons', () => {
      it('Then changes the displayed month', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 15),
        });
        container.appendChild(root);

        const navButtons = Array.from(root.querySelectorAll('button')).filter(
          (b) => !b.hasAttribute('data-date'),
        );
        const prevButton = navButtons[0] as HTMLButtonElement;
        const nextButton = navButtons[1] as HTMLButtonElement;

        // Find title element - it should contain the month/year text
        const titleEl = root.querySelector('div > div > div') as HTMLElement;
        expect(titleEl?.textContent).toContain('June 2024');

        nextButton.click();
        expect(titleEl?.textContent).toContain('July 2024');

        prevButton.click();
        expect(titleEl?.textContent).toContain('June 2024');

        prevButton.click();
        expect(titleEl?.textContent).toContain('May 2024');
      });
    });
  });

  describe('Given a ComposedCalendar with onValueChange', () => {
    describe('When clicking a date', () => {
      it('Then calls onValueChange with the selected date', () => {
        const onValueChange = vi.fn();
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          onValueChange,
        });
        container.appendChild(root);

        const btn10 = root.querySelector('button[data-date="2024-06-10"]') as HTMLButtonElement;
        btn10.click();

        expect(onValueChange).toHaveBeenCalledTimes(1);
        const val = onValueChange.mock.calls[0]?.[0] as Date;
        expect(val.getDate()).toBe(10);
      });

      it('Then updates aria-selected on the clicked date (#1581)', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);

        const btn10 = root.querySelector('button[data-date="2024-06-10"]') as HTMLButtonElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;

        // Before click: no date is selected
        expect(btn10.getAttribute('aria-selected')).toBeNull();
        expect(btn15.getAttribute('aria-selected')).toBeNull();

        // Click date 10
        btn10.click();
        expect(btn10.getAttribute('aria-selected')).toBe('true');
        expect(btn15.getAttribute('aria-selected')).toBeNull();

        // Click date 15 — selection moves
        btn15.click();
        expect(btn10.getAttribute('aria-selected')).toBeNull();
        expect(btn15.getAttribute('aria-selected')).toBe('true');
      });
    });
  });

  describe('Given a ComposedCalendar with onMonthChange', () => {
    describe('When navigating months', () => {
      it('Then calls onMonthChange', () => {
        const onMonthChange = vi.fn();
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 15),
          onMonthChange,
        });
        container.appendChild(root);

        const navButtons = Array.from(root.querySelectorAll('button')).filter(
          (b) => !b.hasAttribute('data-date'),
        );
        (navButtons[1] as HTMLButtonElement).click(); // next
        expect(onMonthChange).toHaveBeenCalledTimes(1);
        const val = onMonthChange.mock.calls[0]?.[0] as Date;
        expect(val.getMonth()).toBe(6);

        (navButtons[0] as HTMLButtonElement).click(); // prev
        expect(onMonthChange).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Given a ComposedCalendar in range mode', () => {
    describe('When rendered with a range value', () => {
      it('Then sets data-range-start, data-range-end, and data-in-range', () => {
        const root = ComposedCalendar({
          mode: 'range',
          defaultMonth: new Date(2024, 5, 1),
          defaultValue: { from: new Date(2024, 5, 10), to: new Date(2024, 5, 15) },
        });
        container.appendChild(root);

        const btnStart = root.querySelector('button[data-date="2024-06-10"]');
        const btnEnd = root.querySelector('button[data-date="2024-06-15"]');
        const btnMiddle = root.querySelector('button[data-date="2024-06-12"]');

        expect(btnStart?.getAttribute('data-range-start')).toBe('true');
        expect(btnEnd?.getAttribute('data-range-end')).toBe('true');
        expect(btnMiddle?.getAttribute('data-in-range')).toBe('true');
      });
    });
  });

  describe('Given captionLayout="dropdown"', () => {
    describe('When rendered', () => {
      it('Then renders month <select> with aria-label="Select month"', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector('select[aria-label="Select month"]');
        expect(monthSelect).not.toBeNull();
      });

      it('Then renders year <select> with aria-label="Select year"', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector('select[aria-label="Select year"]');
        expect(yearSelect).not.toBeNull();
      });

      it('Then does NOT render prev/next arrow buttons', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const prevBtn = root.querySelector('button[aria-label="Previous month"]');
        const nextBtn = root.querySelector('button[aria-label="Next month"]');
        expect(prevBtn).toBeNull();
        expect(nextBtn).toBeNull();
      });

      it('Then month select shows current month as selected', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        const selectedOption = monthSelect.querySelector('option[selected]') as HTMLOptionElement;
        expect(selectedOption).not.toBeNull();
        expect(selectedOption.value).toBe('5');
      });

      it('Then year select shows current year as selected', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        const selectedOption = yearSelect.querySelector('option[selected]') as HTMLOptionElement;
        expect(selectedOption).not.toBeNull();
        expect(selectedOption.value).toBe('2024');
      });

      it('Then applies monthSelect class to month <select>', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          classes: { monthSelect: 'cal-month-sel' },
        });
        container.appendChild(root);
        const monthSelect = root.querySelector('select[aria-label="Select month"]');
        expect(monthSelect?.className).toContain('cal-month-sel');
      });

      it('Then applies yearSelect class to year <select>', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          classes: { yearSelect: 'cal-year-sel' },
        });
        container.appendChild(root);
        const yearSelect = root.querySelector('select[aria-label="Select year"]');
        expect(yearSelect?.className).toContain('cal-year-sel');
      });
    });
  });

  describe('Given captionLayout="dropdown" with month/year selection', () => {
    describe('When selecting a different month', () => {
      it('Then updates the calendar grid to show the new month', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        monthSelect.value = '0';
        monthSelect.dispatchEvent(new Event('change'));
        // Grid should now show January 2024 dates
        const jan1Btn = root.querySelector('button[data-date="2024-01-01"]');
        expect(jan1Btn).not.toBeNull();
      });

      it('Then fires onMonthChange with the new Date', () => {
        const onMonthChange = vi.fn();
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          onMonthChange,
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        monthSelect.value = '0';
        monthSelect.dispatchEvent(new Event('change'));
        expect(onMonthChange).toHaveBeenCalledTimes(1);
        const val = onMonthChange.mock.calls[0]?.[0] as Date;
        expect(val.getMonth()).toBe(0);
        expect(val.getFullYear()).toBe(2024);
      });
    });

    describe('When selecting a different year', () => {
      it('Then updates the calendar grid to show the new year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2030, 11, 31),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        yearSelect.value = '2025';
        yearSelect.dispatchEvent(new Event('change'));
        // Grid should now show June 2025 dates
        const jun1Btn = root.querySelector('button[data-date="2025-06-01"]');
        expect(jun1Btn).not.toBeNull();
      });

      it('Then fires onMonthChange with the new Date', () => {
        const onMonthChange = vi.fn();
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2030, 11, 31),
          onMonthChange,
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        yearSelect.value = '2025';
        yearSelect.dispatchEvent(new Event('change'));
        expect(onMonthChange).toHaveBeenCalledTimes(1);
        const val = onMonthChange.mock.calls[0]?.[0] as Date;
        expect(val.getMonth()).toBe(5);
        expect(val.getFullYear()).toBe(2025);
      });
    });
  });

  describe('Given captionLayout="dropdown" with minDate/maxDate constraints', () => {
    describe('When minDate and maxDate are provided', () => {
      it('Then year select only contains years within range', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        const years = Array.from(yearSelect.options).map((o) => Number(o.value));
        expect(years[0]).toBe(2020);
        expect(years[years.length - 1]).toBe(2026);
        expect(years.length).toBe(7);
      });

      it('Then months before minDate are disabled in boundary year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2020, 5, 1),
          minDate: new Date(2020, 2, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        const janOption = monthSelect.querySelector('option[value="0"]') as HTMLOptionElement;
        const febOption = monthSelect.querySelector('option[value="1"]') as HTMLOptionElement;
        const marOption = monthSelect.querySelector('option[value="2"]') as HTMLOptionElement;
        expect(janOption.disabled).toBe(true);
        expect(febOption.disabled).toBe(true);
        expect(marOption.disabled).toBe(false);
      });

      it('Then months after maxDate are disabled in boundary year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2026, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 8, 30),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        const sepOption = monthSelect.querySelector('option[value="8"]') as HTMLOptionElement;
        const octOption = monthSelect.querySelector('option[value="9"]') as HTMLOptionElement;
        expect(sepOption.disabled).toBe(false);
        expect(octOption.disabled).toBe(true);
      });
    });

    describe('When minDate and maxDate are in the same year', () => {
      it('Then year select contains only that year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2024, 2, 1),
          maxDate: new Date(2024, 8, 30),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        expect(yearSelect.options.length).toBe(1);
        expect(yearSelect.options[0]?.value).toBe('2024');
      });

      it('Then months before minDate AND after maxDate are both disabled', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2024, 2, 1),
          maxDate: new Date(2024, 8, 30),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        expect((monthSelect.querySelector('option[value="1"]') as HTMLOptionElement).disabled).toBe(
          true,
        );
        expect((monthSelect.querySelector('option[value="2"]') as HTMLOptionElement).disabled).toBe(
          false,
        );
        expect((monthSelect.querySelector('option[value="8"]') as HTMLOptionElement).disabled).toBe(
          false,
        );
        expect((monthSelect.querySelector('option[value="9"]') as HTMLOptionElement).disabled).toBe(
          true,
        );
      });
    });

    describe('When no minDate/maxDate', () => {
      it('Then year range defaults to current year -100 to +10', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        const yearSelect = root.querySelector(
          'select[aria-label="Select year"]',
        ) as HTMLSelectElement;
        const years = Array.from(yearSelect.options).map((o) => Number(o.value));
        const currentYear = new Date().getFullYear();
        expect(years[0]).toBe(currentYear - 100);
        expect(years[years.length - 1]).toBe(currentYear + 10);
      });
    });

    describe('When selecting a disabled month option', () => {
      it('Then displayMonth does NOT change', () => {
        const onMonthChange = vi.fn();
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2020, 5, 1),
          minDate: new Date(2020, 2, 1),
          maxDate: new Date(2026, 11, 31),
          onMonthChange,
        });
        container.appendChild(root);
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        // Try to select January (disabled)
        monthSelect.value = '0';
        monthSelect.dispatchEvent(new Event('change'));
        expect(onMonthChange).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given captionLayout="dropdown-buttons"', () => {
    describe('When rendered', () => {
      it('Then renders both selects AND prev/next arrow buttons', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        expect(root.querySelector('select[aria-label="Select month"]')).not.toBeNull();
        expect(root.querySelector('select[aria-label="Select year"]')).not.toBeNull();
        expect(root.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
        expect(root.querySelector('button[aria-label="Next month"]')).not.toBeNull();
      });
    });

    describe('When clicking prev/next with dropdown-buttons', () => {
      it('Then updates both the grid and the select values', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2030, 11, 31),
        });
        container.appendChild(root);
        const nextBtn = root.querySelector('button[aria-label="Next month"]') as HTMLButtonElement;
        nextBtn.click();
        // Grid should now show July 2024
        const jul1Btn = root.querySelector('button[data-date="2024-07-01"]');
        expect(jul1Btn).not.toBeNull();
        // Month select should reflect July
        const monthSelect = root.querySelector(
          'select[aria-label="Select month"]',
        ) as HTMLSelectElement;
        const selectedOption = monthSelect.querySelector('option[selected]') as HTMLOptionElement;
        expect(selectedOption.value).toBe('6');
      });
    });

    describe('When at the boundary of the year range', () => {
      it('Then prev button is disabled at min year/month', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2020, 0, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const prevBtn = root.querySelector('button[aria-label="Previous month"]');
        expect(prevBtn?.getAttribute('aria-disabled')).toBe('true');
      });

      it('Then next button is disabled at max year/month', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2026, 11, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const nextBtn = root.querySelector('button[aria-label="Next month"]');
        expect(nextBtn?.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });

  describe('Given captionLayout="buttons" (default)', () => {
    describe('When rendered', () => {
      it('Then renders arrow buttons and title, no <select> elements', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
        });
        container.appendChild(root);
        expect(root.querySelector('select')).toBeNull();
        expect(root.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
        expect(root.querySelector('button[aria-label="Next month"]')).not.toBeNull();
      });
    });
  });

  describe('Given a ComposedCalendar with keyboard navigation', () => {
    describe('When arrow keys are pressed', () => {
      it('Then ArrowRight moves focus by 1 day', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);

        const grid = root.querySelector('[role="grid"]') as HTMLElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
        btn15.focus();

        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-16');
      });

      it('Then ArrowLeft moves focus back by 1 day', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);

        const grid = root.querySelector('[role="grid"]') as HTMLElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
        btn15.focus();

        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-14');
      });

      it('Then ArrowDown moves focus by 7 days', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);

        const grid = root.querySelector('[role="grid"]') as HTMLElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
        btn15.focus();

        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-22');
      });

      it('Then ArrowUp moves focus back by 7 days', () => {
        const root = ComposedCalendar({ defaultMonth: new Date(2024, 5, 1) });
        container.appendChild(root);

        const grid = root.querySelector('[role="grid"]') as HTMLElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
        btn15.focus();

        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement?.getAttribute('data-date')).toBe('2024-06-08');
      });
    });

    describe('When Enter is pressed on a focused date', () => {
      it('Then selects the date and calls onValueChange', () => {
        const onValueChange = vi.fn();
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
          onValueChange,
        });
        container.appendChild(root);

        const grid = root.querySelector('[role="grid"]') as HTMLElement;
        const btn15 = root.querySelector('button[data-date="2024-06-15"]') as HTMLButtonElement;
        btn15.focus();

        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onValueChange).toHaveBeenCalledTimes(1);
        const val = onValueChange.mock.calls[0]?.[0] as Date;
        expect(val.getDate()).toBe(15);
      });
    });
  });
});
