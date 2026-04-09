import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { Foreign } from '../component/foreign';
import { __flushMountFrame, __pushMountFrame, onMount } from '../component/lifecycle';
import { resetInjectedStyles } from '../css/css';
import {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
} from '../dom/element';
import { __on } from '../dom/events';
import { getIsHydrating } from '../hydrate/hydration-context';
import { mount } from '../mount';
import { domEffect, signal } from '../runtime/signal';

describe('Foreign — integration', () => {
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

  it('external code appends children to Foreign container after hydration', () => {
    root.innerHTML = '<div><div class="chart-host"></div><p>Status: OK</p></div>';

    const ssrP = root.querySelector('p') as HTMLElement;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'chart-host',
          onReady: (container) => {
            // Simulate external library (like Chart.js) creating DOM
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            container.appendChild(canvas);

            const legend = document.createElement('div');
            legend.className = 'legend';
            legend.textContent = 'Revenue';
            container.appendChild(legend);
          },
        }),
      );

      const p = __element('p');
      __enterChildren(p);
      __append(p, __staticText('Status: OK'));
      __exitChildren();
      __append(el, p);

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // External content was added
    const chartHost = root.querySelector('.chart-host') as HTMLElement;
    expect(chartHost.querySelector('canvas')).not.toBeNull();
    expect(chartHost.querySelector('.legend')?.textContent).toBe('Revenue');
    // Sibling correctly claimed from SSR
    expect(root.querySelector('p')).toBe(ssrP);
    expect(ssrP.textContent).toBe('Status: OK');
  });

  it('Foreign + reactive domEffect bridge pushes updates to external content', () => {
    const data = signal([10, 20, 30]);
    let externalValues: number[] = [];

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          onReady: (container) => {
            // Reactive bridge — domEffect pushes updates to external
            domEffect(() => {
              externalValues = [...data.value];
              container.textContent = data.value.join(',');
            });
          },
        }),
      );

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // Initial data received
    expect(externalValues).toEqual([10, 20, 30]);

    // Update signal — effect pushes to external
    data.value = [40, 50, 60];
    expect(externalValues).toEqual([40, 50, 60]);
  });

  it('Foreign cleanup runs on unmount (cleanup coordination)', () => {
    const cleanupOrder: string[] = [];

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          onReady: () => {
            return () => {
              cleanupOrder.push('foreign-cleanup');
            };
          },
        }),
      );

      onMount(() => {
        return () => {
          cleanupOrder.push('parent-cleanup');
        };
      });

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    const handle = mount(App);
    expect(cleanupOrder).toEqual([]);

    handle.unmount();
    // Both cleanups ran
    expect(cleanupOrder).toContain('foreign-cleanup');
    expect(cleanupOrder).toContain('parent-cleanup');
  });

  it('Foreign coexists with reactive siblings during hydration', () => {
    root.innerHTML = '<div><div class="external"></div><span><!--child-->0</span></div>';

    const count = signal(0);
    let foreignReady = false;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'external',
          onReady: () => {
            foreignReady = true;
          },
        }),
      );

      const span = __element('span');
      __enterChildren(span);
      __append(
        span,
        __child(() => count.value),
      );
      __exitChildren();
      __append(el, span);

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    expect(foreignReady).toBe(true);
    // Reactive sibling works correctly
    count.value = 42;
    // With comment markers, the reactive text is a direct child of the outer <span>
    expect(root.querySelector('span')?.textContent).toBe('42');
  });

  it('Foreign with button sibling — events work after hydration', () => {
    root.innerHTML = '<div><div class="widget"></div><button>Click</button></div>';

    const ssrButton = root.querySelector('button') as HTMLElement;
    let clicked = false;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(el, Foreign({ className: 'widget' }));

      const btn = __element('button');
      __on(btn, 'click', () => {
        clicked = true;
      });
      __enterChildren(btn);
      __append(btn, __staticText('Click'));
      __exitChildren();
      __append(el, btn);

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    expect(root.querySelector('button')).toBe(ssrButton);
    ssrButton.click();
    expect(clicked).toBe(true);
  });

  it('multiple Foreign components in the same tree', () => {
    root.innerHTML = '<div><div class="chart-a"></div><div class="chart-b"></div></div>';

    const readyElements: string[] = [];

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'chart-a',
          onReady: () => {
            readyElements.push('chart-a');
          },
        }),
      );

      __append(
        el,
        Foreign({
          className: 'chart-b',
          onReady: () => {
            readyElements.push('chart-b');
          },
        }),
      );

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    expect(readyElements).toEqual(['chart-a', 'chart-b']);
  });

  it('Foreign preserves SSR children during hydration', () => {
    // SSR rendered an empty container, but imagine a CDN/edge injected content
    root.innerHTML = '<div><div class="map"><img src="static-map.png" alt="map"></div></div>';

    const ssrImg = root.querySelector('img') as HTMLElement;

    const App = () => {
      __pushMountFrame();
      const el = __element('div');
      __enterChildren(el);

      __append(
        el,
        Foreign({
          className: 'map',
          onReady: (container) => {
            // External code enhances but doesn't remove the static content
            const overlay = document.createElement('div');
            overlay.className = 'map-overlay';
            container.appendChild(overlay);
          },
        }),
      );

      __exitChildren();
      __flushMountFrame();
      return el;
    };

    mount(App);

    // Original SSR content preserved
    expect(root.querySelector('img')).toBe(ssrImg);
    // External overlay added
    expect(root.querySelector('.map-overlay')).not.toBeNull();
  });
});
