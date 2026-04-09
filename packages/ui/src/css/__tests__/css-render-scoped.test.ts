import { afterEach, describe, expect, it } from '@vertz/test';
import type { SSRRenderContext } from '../../ssr/ssr-render-context';
import { registerSSRResolver } from '../../ssr/ssr-render-context';
import { injectCSS, resetInjectedStyles } from '../css';

describe('injectCSS() render-scoped CSS tracking', () => {
  afterEach(() => {
    resetInjectedStyles();
    registerSSRResolver(null);
  });

  it('writes to ssrCtx.cssTracker when SSR context has a tracker', () => {
    const cssTracker = new Set<string>();
    const ctx = { cssTracker } as unknown as SSRRenderContext;
    registerSSRResolver(() => ctx);

    injectCSS('.test { color: red; }');

    expect(cssTracker.has('.test { color: red; }')).toBe(true);
  });

  it('does not throw when SSR context has no cssTracker', () => {
    const ctx = {} as SSRRenderContext;
    registerSSRResolver(() => ctx);

    // Should not throw — gracefully skips cssTracker write
    injectCSS('.test { color: blue; }');
  });

  it('isolates CSS between different SSR render contexts', () => {
    const tracker1 = new Set<string>();
    const tracker2 = new Set<string>();

    // Render 1: inject button CSS
    const ctx1 = { cssTracker: tracker1 } as unknown as SSRRenderContext;
    registerSSRResolver(() => ctx1);
    injectCSS('.button { display: flex; }');

    // Render 2: inject card CSS
    const ctx2 = { cssTracker: tracker2 } as unknown as SSRRenderContext;
    registerSSRResolver(() => ctx2);
    injectCSS('.card { border: 1px solid; }');

    // Each tracker only has CSS from its own render
    expect(tracker1.has('.button { display: flex; }')).toBe(true);
    expect(tracker1.has('.card { border: 1px solid; }')).toBe(false);
    expect(tracker2.has('.card { border: 1px solid; }')).toBe(true);
    expect(tracker2.has('.button { display: flex; }')).toBe(false);
  });

  it('re-injected CSS appears in new cssTracker even if in global Set', () => {
    // First call: no SSR context, goes to global Set only
    injectCSS('.shared { margin: 0; }');

    // Second call: SSR context active, re-inject same CSS
    const cssTracker = new Set<string>();
    const ctx = { cssTracker } as unknown as SSRRenderContext;
    registerSSRResolver(() => ctx);
    injectCSS('.shared { margin: 0; }');

    // cssTracker should have it despite being in global Set already
    expect(cssTracker.has('.shared { margin: 0; }')).toBe(true);
  });
});
