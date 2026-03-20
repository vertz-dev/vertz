import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { resetInjectedStyles } from '../../css/css';
import {
  __append,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
} from '../../dom/element';
import { getIsHydrating } from '../../hydrate/hydration-context';
import { mount } from '../../mount';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { Foreign } from '../foreign';
import { __flushMountFrame, __pushMountFrame, onMount } from '../lifecycle';

describe('Foreign — CSR', () => {
  let root: HTMLElement;

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

  it('creates a div container by default and calls onReady', () => {
    let readyEl: HTMLElement | null = null;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(
        el,
        Foreign({
          onReady: (container) => {
            readyEl = container;
          },
        }),
      );
      __exitChildren();
      return el;
    };

    mount(App);

    expect(readyEl).not.toBeNull();
    expect(readyEl!.tagName).toBe('DIV');
  });

  it('supports custom tag prop', () => {
    let readyEl: HTMLElement | null = null;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(
        el,
        Foreign({
          tag: 'canvas',
          onReady: (container) => {
            readyEl = container;
          },
        }),
      );
      __exitChildren();
      return el;
    };

    mount(App);

    expect(readyEl).not.toBeNull();
    expect(readyEl!.tagName).toBe('CANVAS');
  });

  it('supports SVG tag', () => {
    let readyEl: Element | null = null;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(
        el,
        Foreign({
          tag: 'svg',
          onReady: (container) => {
            readyEl = container;
          },
        }),
      );
      __exitChildren();
      return el;
    };

    mount(App);

    expect(readyEl).not.toBeNull();
    expect(readyEl!.tagName.toLowerCase()).toBe('svg');
  });

  it('applies id, className and style', () => {
    let readyEl: HTMLElement | null = null;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(
        el,
        Foreign({
          id: 'my-chart',
          className: 'chart-container',
          style: { width: '100%', height: '400px' },
          onReady: (container) => {
            readyEl = container;
          },
        }),
      );
      __exitChildren();
      return el;
    };

    mount(App);

    expect(readyEl).not.toBeNull();
    expect(readyEl!.id).toBe('my-chart');
    expect(readyEl!.className).toBe('chart-container');
    expect(readyEl!.style.width).toBe('100%');
    expect(readyEl!.style.height).toBe('400px');
  });

  it('cleanup runs on unmount', () => {
    let cleaned = false;

    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(
        el,
        Foreign({
          onReady: () => {
            return () => {
              cleaned = true;
            };
          },
        }),
      );
      __exitChildren();
      return el;
    };

    const handle = mount(App);
    expect(cleaned).toBe(false);

    handle.unmount();
    expect(cleaned).toBe(true);
  });

  it('works without onReady (bare container)', () => {
    const App = () => {
      const el = __element('div');
      __enterChildren(el);
      __append(el, Foreign({}));
      __exitChildren();
      return el;
    };

    const handle = mount(App);

    // Should render a div with no children
    const foreignEl = root.querySelector('#app > div > div');
    expect(foreignEl).not.toBeNull();
    expect(foreignEl!.children.length).toBe(0);

    handle.unmount();
  });
});

describe('Foreign — hydration', () => {
  let root: HTMLElement;

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

  it('claims the container element from SSR DOM without entering children', () => {
    // SSR output: Foreign rendered an empty div with class, but browser/3rd party added children
    root.innerHTML = '<div><div class="chart"><canvas>external</canvas></div><p>After</p></div>';

    const ssrChart = root.querySelector('.chart') as HTMLElement;
    const ssrP = root.querySelector('p') as HTMLElement;
    let claimedP: Element | null = null;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      // Foreign claims the .chart div but does NOT enter children
      __append(el, Foreign({ className: 'chart' }));

      // The <p> should be correctly claimed (cursor advanced past .chart)
      const p = __element('p');
      claimedP = p;
      __enterChildren(p);
      __append(p, __staticText('After'));
      __exitChildren();
      __append(el, p);

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // Foreign claimed the SSR .chart div
    expect(root.querySelector('.chart')).toBe(ssrChart);
    // Canvas child inside .chart is preserved (not walked by hydration)
    expect(ssrChart.querySelector('canvas')).not.toBeNull();
    expect(ssrChart.querySelector('canvas')!.textContent).toBe('external');
    // Sibling <p> correctly claimed
    expect(claimedP).toBe(ssrP);
  });

  it('onReady fires after hydration with the claimed element', () => {
    root.innerHTML = '<div><div class="chart"></div></div>';

    const ssrChart = root.querySelector('.chart') as HTMLElement;
    let readyEl: HTMLElement | null = null;
    let wasHydrating: boolean | null = null;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'chart',
          onReady: (container) => {
            readyEl = container;
            wasHydrating = getIsHydrating();
          },
        }),
      );

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // onReady received the SSR-claimed element
    expect(readyEl).toBe(ssrChart);
    // onReady ran after hydration ended
    expect(wasHydrating).toBe(false);
  });

  it('DOM manipulation in onReady does not affect Vertz sibling elements', () => {
    root.innerHTML = '<div><div class="chart"></div><p>Sibling</p></div>';

    const ssrP = root.querySelector('p') as HTMLElement;
    let claimedP: Element | null = null;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'chart',
          onReady: (container) => {
            // External code manipulates the container
            container.innerHTML = '<canvas width="400" height="300"></canvas>';
          },
        }),
      );

      const p = __element('p');
      claimedP = p;
      __enterChildren(p);
      __append(p, __staticText('Sibling'));
      __exitChildren();
      __append(el, p);

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // Sibling correctly claimed
    expect(claimedP).toBe(ssrP);
    // Foreign container has external content
    expect(root.querySelector('.chart canvas')).not.toBeNull();
    // Sibling still correct
    expect(ssrP.textContent).toBe('Sibling');
  });
});
