import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedToggle } from '../toggle-composed';

describe('Composed Toggle', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedToggle with children and classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with aria-pressed and applies root class', () => {
        const icon = document.createElement('span');
        icon.textContent = 'B';
        const root = ComposedToggle({
          classes: { root: 'tgl-root' },
          children: [icon],
        });
        container.appendChild(root);

        const btn = root.querySelector('[aria-pressed]') ?? root;
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.className).toContain('tgl-root');
      });

      it('Then moves children into the button', () => {
        const icon = document.createElement('span');
        icon.textContent = 'B';
        const root = ComposedToggle({
          children: [icon],
        });
        container.appendChild(root);

        const btn = root.querySelector('[aria-pressed]') ?? root;
        expect(btn.contains(icon)).toBe(true);
      });
    });
  });

  describe('Given a ComposedToggle with defaultPressed', () => {
    describe('When clicked', () => {
      it('Then toggles aria-pressed and fires onPressedChange', () => {
        let lastValue: unknown;
        const root = ComposedToggle({
          defaultPressed: true,
          onPressedChange: (pressed) => {
            lastValue = pressed;
          },
        });
        container.appendChild(root);

        const btn = root.querySelector('[aria-pressed]') ?? root;
        expect(btn.getAttribute('aria-pressed')).toBe('true');

        (btn as HTMLElement).click();
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(lastValue).toBe(false);
      });
    });
  });
});
