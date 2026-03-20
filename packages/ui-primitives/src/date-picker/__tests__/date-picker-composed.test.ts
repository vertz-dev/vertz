import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedDatePicker } from '../date-picker-composed';

describe('Composed DatePicker', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedDatePicker with defaults', () => {
    describe('When rendered', () => {
      it('Then creates a trigger button with default placeholder', () => {
        const root = ComposedDatePicker({});
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger).toBeInstanceOf(HTMLButtonElement);
        expect(trigger.textContent).toBe('Pick a date');
      });

      it('Then marks trigger with data-placeholder="true" when no value', () => {
        const root = ComposedDatePicker({});
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.getAttribute('data-placeholder')).toBe('true');
      });

      it('Then renders a calendar grid with role="grid"', () => {
        const root = ComposedDatePicker({});
        container.appendChild(root);
        // Calendar grid is inside the popover content, which starts hidden
        const grid = root.querySelector('[role="grid"]');
        expect(grid).not.toBeNull();
      });
    });
  });

  describe('Given a ComposedDatePicker with custom placeholder', () => {
    describe('When rendered', () => {
      it('Then shows the custom placeholder text', () => {
        const root = ComposedDatePicker({ placeholder: 'Select date' });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.textContent).toBe('Select date');
      });
    });
  });

  describe('Given a ComposedDatePicker with defaultValue', () => {
    describe('When rendered', () => {
      it('Then shows formatted date on trigger', () => {
        const date = new Date(2025, 0, 15);
        const root = ComposedDatePicker({
          defaultValue: date,
          formatDate: (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.textContent).toBe('2025-01-15');
      });

      it('Then does not set data-placeholder attribute', () => {
        const date = new Date(2025, 0, 15);
        const root = ComposedDatePicker({ defaultValue: date });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.getAttribute('data-placeholder')).toBeNull();
      });
    });
  });

  describe('Given a ComposedDatePicker with classes', () => {
    describe('When rendered', () => {
      it('Then applies trigger class to the trigger button', () => {
        const root = ComposedDatePicker({
          classes: { trigger: 'dp-trigger' },
        });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.className).toContain('dp-trigger');
      });

      it('Then applies content class to the popover content', () => {
        const root = ComposedDatePicker({
          classes: { content: 'dp-content' },
        });
        container.appendChild(root);
        const content = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(content.className).toContain('dp-content');
      });

      it('Then passes calendar classes to the calendar', () => {
        const root = ComposedDatePicker({
          classes: { calendar: { root: 'cal-root', grid: 'cal-grid' } },
        });
        container.appendChild(root);
        const grid = root.querySelector('[role="grid"]');
        expect(grid?.className).toContain('cal-grid');
      });
    });
  });

  describe('Given a ComposedDatePicker in single mode', () => {
    describe('When a date is selected', () => {
      it('Then calls onValueChange with the selected date', () => {
        const onValueChange = vi.fn();
        const root = ComposedDatePicker({
          defaultMonth: new Date(2025, 5, 1),
          onValueChange,
        });
        container.appendChild(root);

        // Open the popover
        const trigger = root.querySelector('button') as HTMLButtonElement;
        trigger.click();

        // Find and click a day button
        const dayBtn = root.querySelector('button[data-date="2025-06-15"]') as HTMLButtonElement;
        expect(dayBtn).not.toBeNull();
        dayBtn.click();

        expect(onValueChange).toHaveBeenCalled();
        const selectedDate = onValueChange.mock.calls[0]?.[0] as Date;
        expect(selectedDate.getDate()).toBe(15);
      });

      it('Then updates trigger text with formatted date', () => {
        const root = ComposedDatePicker({
          defaultMonth: new Date(2025, 5, 1),
          formatDate: (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        });
        container.appendChild(root);

        const trigger = root.querySelector('button') as HTMLButtonElement;
        trigger.click();

        const dayBtn = root.querySelector('button[data-date="2025-06-15"]') as HTMLButtonElement;
        dayBtn.click();

        expect(trigger.textContent).toBe('2025-06-15');
        expect(trigger.getAttribute('data-placeholder')).toBeNull();
      });
    });
  });

  describe('Given a ComposedDatePicker with onOpenChange', () => {
    describe('When the trigger is clicked', () => {
      it('Then calls onOpenChange with true', () => {
        const onOpenChange = vi.fn();
        const root = ComposedDatePicker({ onOpenChange });
        container.appendChild(root);

        const trigger = root.querySelector('button') as HTMLButtonElement;
        trigger.click();

        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Given a ComposedDatePicker in range mode', () => {
    describe('When rendered with a default range', () => {
      it('Then shows range display on trigger', () => {
        const from = new Date(2025, 0, 10);
        const to = new Date(2025, 0, 20);
        const root = ComposedDatePicker({
          mode: 'range',
          defaultValue: { from, to },
          formatDate: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
        });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.textContent).toContain('1/10');
        expect(trigger.textContent).toContain('1/20');
      });
    });
  });

  describe('Given a ComposedDatePicker with custom formatDate', () => {
    describe('When rendered with a defaultValue', () => {
      it('Then uses the custom format', () => {
        const date = new Date(2025, 11, 25);
        const root = ComposedDatePicker({
          defaultValue: date,
          formatDate: () => 'Christmas!',
        });
        container.appendChild(root);
        const trigger = root.querySelector('button') as HTMLButtonElement;
        expect(trigger.textContent).toBe('Christmas!');
      });
    });
  });

  describe('Given a ComposedDatePicker with captionLayout="dropdown"', () => {
    describe('When rendered', () => {
      it('Then the calendar header contains <select> elements for month and year', () => {
        const root = ComposedDatePicker({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2025, 5, 1),
          minDate: new Date(1926, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const selects = root.querySelectorAll('select');
        expect(selects.length).toBe(2);
      });

      it('Then sets data-caption-layout="dropdown" on the calendar header', () => {
        const root = ComposedDatePicker({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2025, 5, 1),
          minDate: new Date(1926, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const header = root.querySelector('[data-caption-layout="dropdown"]');
        expect(header).not.toBeNull();
      });
    });
  });

  describe('Given a ComposedDatePicker with captionLayout="dropdown-buttons"', () => {
    describe('When rendered', () => {
      it('Then the calendar renders both <select> elements and nav buttons', () => {
        const root = ComposedDatePicker({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2025, 5, 1),
          minDate: new Date(1926, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const selects = root.querySelectorAll('select');
        expect(selects.length).toBe(2);
        const prevBtn = root.querySelector('[aria-label="Previous month"]');
        const nextBtn = root.querySelector('[aria-label="Next month"]');
        expect(prevBtn).not.toBeNull();
        expect(nextBtn).not.toBeNull();
      });
    });
  });

  describe('Given ComposedDatePicker sub-components', () => {
    it('Then has Trigger and Content sub-components', () => {
      expect(typeof ComposedDatePicker.Trigger).toBe('function');
      expect(typeof ComposedDatePicker.Content).toBe('function');
    });
  });
});
