import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedRadioGroup } from '../radio-composed';

describe('Composed RadioGroup', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedRadioGroup with Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a radiogroup with items', () => {
        const root = ComposedRadioGroup({
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'a', children: ['Alpha'] });
            const b = ComposedRadioGroup.Item({ value: 'b', children: ['Beta'] });
            return [a, b];
          },
        });
        container.appendChild(root);

        expect(root.getAttribute('role')).toBe('radiogroup');
        const items = root.querySelectorAll('[role="radio"]');
        expect(items.length).toBe(2);
      });

      it('Then applies root, item, and indicator classes', () => {
        const root = ComposedRadioGroup({
          classes: { root: 'rg-root', item: 'rg-item', indicator: 'rg-ind' },
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'a', children: ['Alpha'] });
            return [a];
          },
        });
        container.appendChild(root);

        expect(root.className).toContain('rg-root');
        const item = root.querySelector('[role="radio"]') as HTMLElement;
        expect(item.className).toContain('rg-item');
        const indicator = item.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator).not.toBeNull();
        expect(indicator?.className).toContain('rg-ind');
      });

      it('Then each item has role="radio"', () => {
        const root = ComposedRadioGroup({
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'x', children: ['X'] });
            const b = ComposedRadioGroup.Item({ value: 'y', children: ['Y'] });
            return [a, b];
          },
        });
        container.appendChild(root);

        const items = root.querySelectorAll('[role="radio"]');
        for (const item of items) {
          expect(item.getAttribute('role')).toBe('radio');
        }
      });
    });
  });

  describe('Given a ComposedRadioGroup with defaultValue', () => {
    describe('When an item is clicked', () => {
      it('Then updates selection and fires onValueChange', () => {
        let lastValue: unknown;
        const root = ComposedRadioGroup({
          defaultValue: 'a',
          onValueChange: (v) => {
            lastValue = v;
          },
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'a', children: ['Alpha'] });
            const b = ComposedRadioGroup.Item({ value: 'b', children: ['Beta'] });
            return [a, b];
          },
        });
        container.appendChild(root);

        // Click second item
        const items = root.querySelectorAll('[role="radio"]');
        (items[1] as HTMLElement).click();
        expect(lastValue).toBe('b');
      });

      it('Then updates indicator data-state on all items', () => {
        const root = ComposedRadioGroup({
          defaultValue: 'a',
          classes: { root: 'r', item: 'i', indicator: 'ind' },
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'a', children: ['Alpha'] });
            const b = ComposedRadioGroup.Item({ value: 'b', children: ['Beta'] });
            return [a, b];
          },
        });
        container.appendChild(root);

        // Initially, first item should be checked
        const items = root.querySelectorAll('[role="radio"]');
        const ind0 = (items[0] as HTMLElement).querySelector(
          '[data-part="indicator"]',
        ) as HTMLElement;
        const ind1 = (items[1] as HTMLElement).querySelector(
          '[data-part="indicator"]',
        ) as HTMLElement;
        expect(ind0?.getAttribute('data-state')).toBe('checked');
        expect(ind1?.getAttribute('data-state')).toBe('unchecked');

        // Click second item
        (items[1] as HTMLElement).click();
        expect(ind0?.getAttribute('data-state')).toBe('unchecked');
        expect(ind1?.getAttribute('data-state')).toBe('checked');
      });
    });
  });

  describe('Given a RadioGroup.Item rendered outside RadioGroup', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedRadioGroup.Item({ value: 'orphan', children: ['Orphan'] });
        }).toThrow('<RadioGroup.Item> must be used inside <RadioGroup>');
      });
    });
  });

  describe('Given a RadioGroup.Item with disabled attribute', () => {
    describe('When rendered', () => {
      it('Then marks the item as aria-disabled', () => {
        const root = ComposedRadioGroup({
          children: () => {
            const a = ComposedRadioGroup.Item({ value: 'a', disabled: true, children: ['Alpha'] });
            return [a];
          },
        });
        container.appendChild(root);

        const item = root.querySelector('[role="radio"]') as HTMLElement;
        expect(item.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });
});
