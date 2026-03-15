import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedProgress } from '../progress-composed';

describe('Composed Progress', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ComposedProgress with classes', () => {
    describe('When rendered', () => {
      it('Then creates a progressbar element with root class', () => {
        const root = ComposedProgress({
          classes: { root: 'pg-root', indicator: 'pg-ind' },
        });
        container.appendChild(root);

        const bar = root.querySelector('[role="progressbar"]') ?? root;
        expect(bar.getAttribute('role')).toBe('progressbar');
        expect(bar.className).toContain('pg-root');
      });

      it('Then creates an indicator child with indicator class', () => {
        const root = ComposedProgress({
          classes: { root: 'pg-root', indicator: 'pg-ind' },
        });
        container.appendChild(root);

        const bar = root.querySelector('[role="progressbar"]') ?? root;
        const indicator = bar.querySelector('[data-part="indicator"]') as HTMLElement;
        expect(indicator).not.toBeNull();
        expect(indicator?.className).toContain('pg-ind');
      });

      it('Then sets initial aria-valuenow from defaultValue', () => {
        const root = ComposedProgress({
          defaultValue: 75,
          classes: { root: 'r', indicator: 'i' },
        });
        container.appendChild(root);

        const bar = root.querySelector('[role="progressbar"]') ?? root;
        expect(bar.getAttribute('aria-valuenow')).toBe('75');
      });
    });
  });
});
