import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ChildValue } from '../component/children';
import { resolveChildren } from '../component/children';
import { createContext, useContext } from '../component/context';
import { resetInjectedStyles } from '../css/css';
import { ThemeProvider } from '../css/theme-provider';
import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../dom/element';
import { endHydration, startHydration } from '../hydrate/hydration-context';
import { signal } from '../runtime/signal';

describe('hydration with thunked children', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    resetInjectedStyles();
  });

  afterEach(() => {
    document.body.removeChild(root);
    resetInjectedStyles();
  });

  it('ThemeProvider adopts SSR nodes when children are thunked', () => {
    // 1. Simulate SSR HTML
    root.innerHTML = '<div data-theme="dark"><h1>Title</h1><p>Content</p></div>';

    const ssrWrapper = root.firstElementChild as HTMLElement;
    const ssrH1 = ssrWrapper.querySelector('h1')!;
    const ssrP = ssrWrapper.querySelector('p')!;

    // 2. Hydrate using the real hydration API
    startHydration(ssrWrapper.parentElement!);

    const result = ThemeProvider({
      theme: 'dark',
      children: () => {
        const h1 = __element('h1');
        __enterChildren(h1);
        __append(h1, __staticText('Title'));
        __exitChildren();
        const p = __element('p');
        __enterChildren(p);
        __append(p, __staticText('Content'));
        __exitChildren();
        return [h1, p] as unknown as ChildValue;
      },
    });

    endHydration();

    // 3. Assert adoption — same DOM references
    expect(result.querySelector('h1')).toBe(ssrH1);
    expect(result.querySelector('p')).toBe(ssrP);
    // Assert no extra nodes created
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelectorAll('p').length).toBe(1);
  });

  it('Context.Provider JSX pattern preserves context during hydration', () => {
    const ThemeCtx = createContext('light');

    // Context.Provider doesn't create DOM — just provides context
    const result = ThemeCtx.Provider({
      value: 'dark',
      children: () => useContext(ThemeCtx),
    });

    expect(result).toBe('dark');
  });

  it('nested providers with thunked children maintain correct hydration order', () => {
    // Simulate SSR HTML with nested providers
    root.innerHTML =
      '<div data-theme="dark"><nav><span>Nav</span></nav><main><p>Content</p></main></div>';

    const ssrWrapper = root.firstElementChild as HTMLElement;
    const ssrNav = ssrWrapper.querySelector('nav')!;
    const ssrMain = ssrWrapper.querySelector('main')!;

    startHydration(ssrWrapper.parentElement!);

    const result = ThemeProvider({
      theme: 'dark',
      children: () => {
        const nav = __element('nav');
        __enterChildren(nav);
        const span = __element('span');
        __enterChildren(span);
        __append(span, __staticText('Nav'));
        __exitChildren();
        __append(nav, span);
        __exitChildren();

        const main = __element('main');
        __enterChildren(main);
        const p = __element('p');
        __enterChildren(p);
        __append(p, __staticText('Content'));
        __exitChildren();
        __append(main, p);
        __exitChildren();

        return [nav, main] as unknown as ChildValue;
      },
    });

    endHydration();

    // SSR nodes should be adopted
    expect(result.querySelector('nav')).toBe(ssrNav);
    expect(result.querySelector('main')).toBe(ssrMain);
  });

  it('reactive updates work post-hydration with thunked children', () => {
    root.innerHTML = '<div data-theme="dark"><p>0</p></div>';

    const ssrWrapper = root.firstElementChild as HTMLElement;

    startHydration(ssrWrapper.parentElement!);

    const count = signal(0);

    const result = ThemeProvider({
      theme: 'dark',
      children: () => {
        const p = __element('p');
        __enterChildren(p);
        __append(p, __staticText('0'));
        __exitChildren();
        return p as unknown as ChildValue;
      },
    });

    endHydration();

    // Verify element was adopted
    expect(result.querySelector('p')!.textContent).toBe('0');

    // Signal updates should work post-hydration
    count.value = 1;
    expect(count.value).toBe(1);
  });
});
