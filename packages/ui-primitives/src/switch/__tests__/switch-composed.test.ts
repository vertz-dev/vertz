import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedSwitch } from '../switch-composed';

describe('Composed Switch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedSwitch with classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with role="switch" and applies root class', () => {
        const root = ComposedSwitch({
          classes: { root: 'sw-root', thumb: 'sw-thumb' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="switch"]') ?? root;
        expect(btn.getAttribute('role')).toBe('switch');
        expect(btn.className).toContain('sw-root');
      });

      it('Then creates a thumb child with the thumb class', () => {
        const root = ComposedSwitch({
          classes: { root: 'sw-root', thumb: 'sw-thumb' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="switch"]') ?? root;
        const thumb = btn.querySelector('[data-part="thumb"]') as HTMLElement;
        expect(thumb).not.toBeNull();
        expect(thumb!.className).toContain('sw-thumb');
      });
    });
  });

  describe('Given a ComposedSwitch with defaultChecked', () => {
    describe('When toggled', () => {
      it('Then syncs thumb data-state with checked state', () => {
        const root = ComposedSwitch({
          defaultChecked: true,
          classes: { root: 'r', thumb: 't' },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="switch"]') ?? root;
        const thumb = btn.querySelector('[data-part="thumb"]') as HTMLElement;
        expect(thumb.getAttribute('data-state')).toBe('checked');

        (btn as HTMLElement).click();
        expect(thumb.getAttribute('data-state')).toBe('unchecked');
      });

      it('Then fires onCheckedChange with new value', () => {
        let lastValue: unknown;
        const root = ComposedSwitch({
          defaultChecked: false,
          onCheckedChange: (checked) => {
            lastValue = checked;
          },
        });
        container.appendChild(root);

        const btn = root.querySelector('[role="switch"]') ?? root;
        (btn as HTMLElement).click();
        expect(lastValue).toBe(true);
      });
    });
  });
});
