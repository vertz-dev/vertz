import { describe, expect, it } from 'bun:test';
import { createRouter, defineRoutes } from '@vertz/ui';
import { installDomShim } from '../dom-shim';
import { discoverRoutes, filterPrerenderableRoutes, prerenderRoutes } from '../prerender';

installDomShim();

describe('discoverRoutes', () => {
  it('discovers all route patterns from an SSR module', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/': { component: () => document.createElement('div') },
          '/about': { component: () => document.createElement('div') },
          '/users/:id': { component: () => document.createElement('div') },
        });
        const router = createRouter(routes);
        // Access current.value to trigger lazy route discovery (as RouterView would)
        router.current.value;
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toContain('/');
    expect(patterns).toContain('/about');
    expect(patterns).toContain('/users/:id');
  });

  it('discovers nested route patterns as full paths', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/docs': {
            component: () => document.createElement('div'),
            children: {
              '/': { component: () => document.createElement('div') },
              '/:slug': { component: () => document.createElement('div') },
            },
          },
        });
        const router = createRouter(routes);
        // Access current.value to trigger lazy route discovery (as RouterView would)
        router.current.value;
        return document.createElement('div');
      },
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toContain('/docs');
    expect(patterns).toContain('/docs/:slug');
  });

  it('returns empty array when app has no router', async () => {
    const module = {
      default: () => {
        return document.createElement('div');
      },
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toEqual([]);
  });
});

describe('filterPrerenderableRoutes', () => {
  it('excludes routes with :param segments', () => {
    const result = filterPrerenderableRoutes([
      '/',
      '/about',
      '/users/:id',
      '/posts/:slug/comments',
    ]);

    expect(result).toContain('/');
    expect(result).toContain('/about');
    expect(result).not.toContain('/users/:id');
    expect(result).not.toContain('/posts/:slug/comments');
  });

  it('excludes routes with * wildcard', () => {
    const result = filterPrerenderableRoutes(['/', '/files/*']);

    expect(result).toContain('/');
    expect(result).not.toContain('/files/*');
  });

  it('excludes routes with prerender: false via compiledRoutes lookup', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': { component: () => document.createElement('div'), prerender: false },
      '/about': { component: () => document.createElement('div') },
    });

    const result = filterPrerenderableRoutes(['/', '/dashboard', '/about'], routes);

    expect(result).toContain('/');
    expect(result).toContain('/about');
    expect(result).not.toContain('/dashboard');
  });

  it('returns all static routes when no compiledRoutes provided', () => {
    const result = filterPrerenderableRoutes(['/', '/about', '/pricing']);

    expect(result).toEqual(['/', '/about', '/pricing']);
  });
});

describe('prerenderRoutes', () => {
  const template = `<!doctype html>
<html>
  <head>
    <title>Test</title>
    <link rel="stylesheet" href="/assets/vertz.css">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/entry.js"></script>
  </body>
</html>`;

  it('pre-renders a single route into the template', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/': { component: () => document.createElement('div') },
          '/about': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'About Page';
              return el;
            },
          },
        });
        createRouter(routes);
        // The router match determines what renders
        const el = document.createElement('div');
        el.textContent = 'About Page';
        return el;
      },
    };

    const results = await prerenderRoutes(module, template, {
      routes: ['/about'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('/about');
    expect(results[0]!.html).toContain('About Page');
    expect(results[0]!.html).toContain('<script type="module" src="/assets/entry.js">');
    expect(results[0]!.html).toContain('<link rel="stylesheet" href="/assets/vertz.css">');
  });

  it('pre-renders multiple routes sequentially', async () => {
    let renderCount = 0;
    const module = {
      default: () => {
        renderCount++;
        const el = document.createElement('div');
        el.textContent = `Render ${renderCount}`;
        return el;
      },
    };

    const results = await prerenderRoutes(module, template, {
      routes: ['/', '/about'],
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.path).toBe('/');
    expect(results[1]!.path).toBe('/about');
  });

  it('injects global CSS as inline styles alongside linked CSS', async () => {
    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Styled page';
        return el;
      },
      styles: ['html, body { margin: 0; background: #0a0a0b; }'],
    };

    const results = await prerenderRoutes(module, template, {
      routes: ['/'],
    });

    const html = results[0]!.html;
    // Global styles should be inlined — they are NOT in vertz.css
    expect(html).toContain('<style data-vertz-css>');
    expect(html).toContain('background: #0a0a0b');
    // Linked CSS should be present but async (non-render-blocking)
    expect(html).toContain('href="/assets/vertz.css" media="print"');
  });

  it('throws PrerenderError when SSR render fails for a route', async () => {
    const module = {
      default: () => {
        throw new Error('loader fetch failed');
      },
    };

    await expect(prerenderRoutes(module, template, { routes: ['/pricing'] })).rejects.toThrow(
      /Pre-render failed for \/pricing/,
    );
  });
});
