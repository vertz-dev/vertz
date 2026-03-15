import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedCheckbox } from '../checkbox-composed';

describe('Composed Checkbox', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedCheckbox with classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with role="checkbox" and applies root class', () => {
        const root = ComposedCheckbox({
          classes: { root: 'cb-root', indicator: 'cb-ind' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        expect(btn.getAttribute('role')).toBe('checkbox');
        expect(btn.className).toContain('cb-root');
      });

      it('Then creates an indicator child with the indicator class', () => {
        const root = ComposedCheckbox({
          classes: { root: 'cb-root', indicator: 'cb-ind' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator).not.toBeNull();
        expect(indicator!.className).toContain('cb-ind');
      });
    });
  });

  describe('Given a ComposedCheckbox with defaultChecked', () => {
    describe('When clicked', () => {
      it('Then toggles aria-checked and fires onCheckedChange', () => {
        let lastValue: unknown;
        const root = ComposedCheckbox({
          defaultChecked: true,
          onCheckedChange: (checked) => {
            lastValue = checked;
          },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        expect(btn.getAttribute('aria-checked')).toBe('true');

        (btn as HTMLElement).click();
        expect(btn.getAttribute('aria-checked')).toBe('false');
        expect(lastValue).toBe(false);
      });
    });
  });

  describe('Given a ComposedCheckbox with defaultChecked', () => {
    describe('When clicked', () => {
      it('Then syncs indicator data-state with checked state', () => {
        const root = ComposedCheckbox({
          defaultChecked: true,
          classes: { root: 'r', indicator: 'i' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator.getAttribute('data-state')).toBe('checked');

        (btn as HTMLElement).click();
        expect(indicator.getAttribute('data-state')).toBe('unchecked');
      });
    });
  });

  describe('Given a ComposedCheckbox with children', () => {
    describe('When rendered', () => {
      it('Then moves children into the button element', () => {
        const label = document.createTextNode('Accept terms');
        const root = ComposedCheckbox({
          children: [label],
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        expect(btn.textContent).toContain('Accept terms');
      });
    });
  });
});
