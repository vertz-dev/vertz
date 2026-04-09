/**
 * Hydration test for ComposedAccordion.
 *
 * Reproduces #1406: during hydration, buildContentEl's __element("div") claims
 * the SSR accordion root div, setting display:none on it and hiding all
 * trigger buttons.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { mount, resetInjectedStyles } from '@vertz/ui';
import { ComposedAccordion } from '../accordion-composed';

/**
 * Renders a component in CSR mode (no hydration) and returns its HTML string.
 * Used to generate realistic SSR HTML for hydration tests.
 */
function csrHTML(factory: () => HTMLElement): string {
  const temp = document.createElement('div');
  const el = factory();
  temp.appendChild(el);
  return temp.innerHTML;
}

function createAccordion(onValueChange?: (v: string[]) => void) {
  return ComposedAccordion({
    onValueChange,
    children: () => {
      const i1 = ComposedAccordion.Item({
        value: 'item1',
        children: () => {
          const t = ComposedAccordion.Trigger({ children: ['Trigger 1'] });
          const c = ComposedAccordion.Content({ children: ['Content 1'] });
          return [t, c];
        },
      });
      const i2 = ComposedAccordion.Item({
        value: 'item2',
        children: () => {
          const t = ComposedAccordion.Trigger({ children: ['Trigger 2'] });
          const c = ComposedAccordion.Content({ children: ['Content 2'] });
          return [t, c];
        },
      });
      return [i1, i2];
    },
  });
}

describe('ComposedAccordion — hydration (#1406)', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
    resetInjectedStyles();
  });

  afterEach(() => {
    document.body.removeChild(root);
    resetInjectedStyles();
  });

  describe('Given SSR HTML from an Accordion', () => {
    describe('When hydrated via mount()', () => {
      it('Then trigger buttons are visible (root not corrupted with display:none)', () => {
        const ssrHtml = csrHTML(() => createAccordion());
        root.innerHTML = ssrHtml;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        mount(() => createAccordion());

        // The accordion root should NOT have display:none —
        // this was the bug: buildContentEl claimed the SSR root as a content
        // element during hydration, setting display:none on it
        const accordionRoot = root.querySelector('[data-orientation="vertical"]');
        expect(accordionRoot).not.toBeNull();
        expect((accordionRoot as HTMLElement).style.display).not.toBe('none');

        // Trigger buttons should exist and be accessible
        const triggers = root.querySelectorAll('button[aria-expanded]');
        expect(triggers.length).toBe(2);

        // The accordion root should NOT have role="region" (that's for content elements)
        expect(accordionRoot?.getAttribute('role')).not.toBe('region');

        warnSpy.mockRestore();
        debugSpy.mockRestore();
      });

      it('Then clicking a trigger expands content after hydration', () => {
        const ssrHtml = csrHTML(() => createAccordion());
        root.innerHTML = ssrHtml;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        let lastValue: string[] | undefined;
        mount(() =>
          createAccordion((v) => {
            lastValue = v;
          }),
        );

        // Click second trigger to expand it
        const triggers = root.querySelectorAll('button[aria-expanded]');
        expect(triggers.length).toBe(2);
        (triggers[1] as HTMLElement).click();
        expect(lastValue).toContain('item2');

        warnSpy.mockRestore();
        debugSpy.mockRestore();
      });
    });
  });

  describe('Given SSR HTML from an Accordion with a pre-opened item', () => {
    describe('When hydrated via mount()', () => {
      it('Then the pre-opened content is visible and closed content is hidden', () => {
        const ssrHtml = csrHTML(() =>
          ComposedAccordion({
            defaultValue: ['item1'],
            children: () => {
              const i1 = ComposedAccordion.Item({
                value: 'item1',
                children: () => {
                  const t = ComposedAccordion.Trigger({ children: ['Trigger 1'] });
                  const c = ComposedAccordion.Content({ children: ['Content 1'] });
                  return [t, c];
                },
              });
              const i2 = ComposedAccordion.Item({
                value: 'item2',
                children: () => {
                  const t = ComposedAccordion.Trigger({ children: ['Trigger 2'] });
                  const c = ComposedAccordion.Content({ children: ['Content 2'] });
                  return [t, c];
                },
              });
              return [i1, i2];
            },
          }),
        );
        root.innerHTML = ssrHtml;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        mount(() =>
          ComposedAccordion({
            defaultValue: ['item1'],
            children: () => {
              const i1 = ComposedAccordion.Item({
                value: 'item1',
                children: () => {
                  const t = ComposedAccordion.Trigger({ children: ['Trigger 1'] });
                  const c = ComposedAccordion.Content({ children: ['Content 1'] });
                  return [t, c];
                },
              });
              const i2 = ComposedAccordion.Item({
                value: 'item2',
                children: () => {
                  const t = ComposedAccordion.Trigger({ children: ['Trigger 2'] });
                  const c = ComposedAccordion.Content({ children: ['Content 2'] });
                  return [t, c];
                },
              });
              return [i1, i2];
            },
          }),
        );

        // First trigger should be expanded
        const triggers = root.querySelectorAll('button[aria-expanded]');
        expect(triggers.length).toBe(2);
        expect((triggers[0] as HTMLElement).getAttribute('aria-expanded')).toBe('true');
        expect((triggers[1] as HTMLElement).getAttribute('aria-expanded')).toBe('false');

        // First content should be visible, second hidden
        const contents = root.querySelectorAll('[role="region"]');
        expect(contents.length).toBe(2);
        expect((contents[0] as HTMLElement).style.display).not.toBe('none');
        expect((contents[1] as HTMLElement).style.display).toBe('none');

        warnSpy.mockRestore();
        debugSpy.mockRestore();
      });
    });
  });
});
