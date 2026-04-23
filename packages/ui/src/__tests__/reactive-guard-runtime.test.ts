/**
 * Runtime regression for the compiler's reactive-guard transform (#2987).
 *
 * The compiler rewrites a component body of the shape
 *
 *   function Comp() {
 *     if (cond) return <Loading/>;
 *     return <Ready/>;
 *   }
 *
 * into a single `__conditional(() => cond, () => Loading, () => Ready)` call
 * so that the guard stays reactive. This test simulates exactly that emitted
 * structure and asserts the DOM swaps when the condition signal flips —
 * catching any regression where the guard collapses back to a static if.
 */
import { describe, expect, it } from '@vertz/test';
import { __conditional } from '../dom/conditional';
import { signal } from '../runtime/signal';

describe('Reactive guard runtime contract (issue #2987)', () => {
  describe('Given a compiler-emitted __conditional wrapping an early-return guard', () => {
    describe('When the guard condition flips from true to false', () => {
      it('Then the DOM swaps from the guard branch to the main branch', () => {
        const loading = signal(true);

        const container = document.createElement('div');
        const fragment = __conditional(
          () => loading.value,
          () => {
            const el = document.createElement('div');
            el.textContent = 'Loading...';
            return el;
          },
          () => {
            const el = document.createElement('div');
            el.textContent = 'Data loaded!';
            return el;
          },
        );
        container.appendChild(fragment);

        expect(container.textContent).toContain('Loading...');

        loading.value = false;

        expect(container.textContent).toContain('Data loaded!');
        expect(container.textContent).not.toContain('Loading...');
      });
    });

    describe('When the guard condition flips back to true', () => {
      it('Then the DOM swaps back to the guard branch', () => {
        const loading = signal(false);

        const container = document.createElement('div');
        const fragment = __conditional(
          () => loading.value,
          () => {
            const el = document.createElement('div');
            el.textContent = 'Loading...';
            return el;
          },
          () => {
            const el = document.createElement('div');
            el.textContent = 'Data loaded!';
            return el;
          },
        );
        container.appendChild(fragment);

        expect(container.textContent).toContain('Data loaded!');

        loading.value = true;

        expect(container.textContent).toContain('Loading...');
      });
    });
  });

  describe('Given nested __conditional wrappers for multiple guards', () => {
    describe('When the outer guard matches', () => {
      it('Then the inner fallback branches are never constructed', () => {
        const loading = signal(true);
        const error = signal(false);
        let readyBuilt = 0;

        const container = document.createElement('div');
        const fragment = __conditional(
          () => loading.value,
          () => {
            const el = document.createElement('div');
            el.textContent = 'L';
            return el;
          },
          () =>
            __conditional(
              () => error.value,
              () => {
                const el = document.createElement('div');
                el.textContent = 'E';
                return el;
              },
              () => {
                readyBuilt++;
                const el = document.createElement('div');
                el.textContent = 'R';
                return el;
              },
            ),
        );
        container.appendChild(fragment);

        expect(container.textContent).toContain('L');
        expect(readyBuilt).toBe(0);
      });
    });

    describe('When guards fall through to the main branch', () => {
      it('Then the main branch renders and updates on further changes', () => {
        const loading = signal(true);
        const error = signal(false);

        const container = document.createElement('div');
        const fragment = __conditional(
          () => loading.value,
          () => {
            const el = document.createElement('div');
            el.textContent = 'L';
            return el;
          },
          () =>
            __conditional(
              () => error.value,
              () => {
                const el = document.createElement('div');
                el.textContent = 'E';
                return el;
              },
              () => {
                const el = document.createElement('div');
                el.textContent = 'R';
                return el;
              },
            ),
        );
        container.appendChild(fragment);

        loading.value = false;
        expect(container.textContent).toContain('R');

        error.value = true;
        expect(container.textContent).toContain('E');
      });
    });
  });
});
