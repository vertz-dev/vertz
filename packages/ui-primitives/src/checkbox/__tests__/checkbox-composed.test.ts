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
        expect(indicator.className).toContain('cb-ind');
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

  describe('Given a ComposedCheckbox in checked state', () => {
    describe('When rendered', () => {
      it('Then the indicator contains both SVG icons (always in DOM)', () => {
        const root = ComposedCheckbox({ defaultChecked: true });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        const svgs = indicator.querySelectorAll('svg');
        expect(svgs.length).toBe(2);

        // Check icon and minus icon are both present
        expect(indicator.querySelector('[data-icon="check"]')).not.toBeNull();
        expect(indicator.querySelector('[data-icon="minus"]')).not.toBeNull();
      });

      it('Then the indicator data-state is "checked"', () => {
        const root = ComposedCheckbox({ defaultChecked: true });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator.getAttribute('data-state')).toBe('checked');
      });
    });
  });

  describe('Given a ComposedCheckbox in indeterminate state', () => {
    describe('When rendered', () => {
      it('Then the indicator data-state is "indeterminate"', () => {
        const root = ComposedCheckbox({ defaultChecked: 'mixed' });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator.getAttribute('data-state')).toBe('indeterminate');
      });

      it('Then the minus icon SVG has the horizontal line path', () => {
        const root = ComposedCheckbox({ defaultChecked: 'mixed' });
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        const minusSvg = indicator.querySelector('[data-icon="minus"]');
        expect(minusSvg).not.toBeNull();
        const path = minusSvg?.querySelector('path');
        expect(path?.getAttribute('d')).toBe('M5 12h14');
      });
    });
  });

  describe('Given a checked ComposedCheckbox', () => {
    describe('When toggled to unchecked', () => {
      it('Then the indicator data-state changes to "unchecked" (SVGs remain in DOM)', () => {
        const root = ComposedCheckbox({ defaultChecked: true });
        container.appendChild(root);

        const btn = (root.querySelector('[role="checkbox"]') ?? root) as HTMLElement;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator.getAttribute('data-state')).toBe('checked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);

        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('unchecked');
        // SVGs always in DOM — visibility controlled by CSS
        expect(indicator.querySelectorAll('svg').length).toBe(2);
      });
    });

    describe('When toggled to unchecked then back to checked', () => {
      it('Then data-state returns to "checked" with exactly two SVGs (no duplicates)', () => {
        const root = ComposedCheckbox({ defaultChecked: true });
        container.appendChild(root);

        const btn = (root.querySelector('[role="checkbox"]') ?? root) as HTMLElement;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;

        // Initial: checked, two SVGs
        expect(indicator.getAttribute('data-state')).toBe('checked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);

        // Uncheck
        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('unchecked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);

        // Re-check — must still have exactly TWO SVGs, not more
        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('checked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);
      });
    });
  });

  describe('Given an unchecked ComposedCheckbox', () => {
    describe('When toggled through multiple states', () => {
      it('Then data-state tracks the checked state correctly', () => {
        const root = ComposedCheckbox({ defaultChecked: false });
        container.appendChild(root);

        const btn = (root.querySelector('[role="checkbox"]') ?? root) as HTMLElement;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;

        // Initial: unchecked
        expect(indicator.getAttribute('data-state')).toBe('unchecked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);

        // Check
        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('checked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);

        // Uncheck
        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('unchecked');

        // Re-check — SVG count stable
        btn.click();
        expect(indicator.getAttribute('data-state')).toBe('checked');
        expect(indicator.querySelectorAll('svg').length).toBe(2);
      });
    });
  });

  describe('Given a ComposedCheckbox with pointer-events: none on indicator', () => {
    describe('When rendered', () => {
      it('Then the indicator span has pointer-events: none to prevent click target race', () => {
        const root = ComposedCheckbox({});
        container.appendChild(root);

        const btn = root.querySelector('[role="checkbox"]') ?? root;
        const indicator = btn.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator.style.pointerEvents).toBe('none');
      });
    });
  });
});
