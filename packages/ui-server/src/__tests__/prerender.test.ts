import { describe, expect, it } from '@vertz/test';
import { createRouter, defineRoutes } from '@vertz/ui';
import { installDomShim } from '../dom-shim';
import {
  collectPrerenderPaths,
  discoverRoutes,
  filterPrerenderableRoutes,
  prerenderRoutes,
} from '../prerender';

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

  it('falls back to exported routes when rendering / throws', async () => {
    // Simulates the landing-page regression: a broken component at the root
    // threw during SSR render, so runtime discovery returned nothing and the
    // whole pre-render pass was skipped even though `/manifesto` was healthy.
    const module = {
      default: () => {
        throw new Error('home page component crashed');
      },
      routes: [
        { pattern: '/', prerender: false },
        { pattern: '/manifesto' },
        { pattern: '/openapi' },
      ],
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toContain('/');
    expect(patterns).toContain('/manifesto');
    expect(patterns).toContain('/openapi');
  });

  it('falls back to exported routes when runtime discovery returns empty', async () => {
    const module = {
      default: () => document.createElement('div'),
      routes: [{ pattern: '/foo' }, { pattern: '/bar' }],
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toContain('/foo');
    expect(patterns).toContain('/bar');
  });

  it('prefers runtime discovery over exported routes when both are available', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/runtime-only': { component: () => document.createElement('div') },
        });
        const router = createRouter(routes);
        router.current.value;
        return document.createElement('div');
      },
      routes: [{ pattern: '/static-only' }],
    };

    const patterns = await discoverRoutes(module);

    expect(patterns).toContain('/runtime-only');
    expect(patterns).not.toContain('/static-only');
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

describe('collectPrerenderPaths', () => {
  it('collects static routes with prerender: true', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div'), prerender: true },
      '/dashboard': { component: () => document.createElement('div'), prerender: false },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toContain('/about');
    expect(paths).not.toContain('/');
    expect(paths).not.toContain('/dashboard');
  });

  it('expands dynamic routes via generateParams', async () => {
    const routes = defineRoutes({
      '/blog/:slug': {
        component: () => document.createElement('div'),
        generateParams: () => [{ slug: 'hello' }, { slug: 'world' }],
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toContain('/blog/hello');
    expect(paths).toContain('/blog/world');
    expect(paths).not.toContain('/blog/:slug');
  });

  it('supports async generateParams', async () => {
    const routes = defineRoutes({
      '/posts/:id': {
        component: () => document.createElement('div'),
        generateParams: async () => [{ id: '1' }, { id: '2' }],
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toEqual(['/posts/1', '/posts/2']);
  });

  it('handles nested routes with generateParams on child', async () => {
    const routes = defineRoutes({
      '/docs': {
        component: () => document.createElement('div'),
        prerender: true,
        children: {
          '/': { component: () => document.createElement('div'), prerender: true },
          '/:slug': {
            component: () => document.createElement('div'),
            generateParams: () => [{ slug: 'intro' }],
          },
        },
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toContain('/docs');
    expect(paths).toContain('/docs/intro');
  });

  it('returns empty array when no routes have prerender or generateParams', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toEqual([]);
  });

  it('skips routes with prerender: false even if they have generateParams', async () => {
    const routes = defineRoutes({
      '/blog/:slug': {
        component: () => document.createElement('div'),
        prerender: false,
        generateParams: () => [{ slug: 'hello' }],
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toEqual([]);
  });

  it('still traverses children when parent has prerender: false', async () => {
    const routes = defineRoutes({
      '/app': {
        component: () => document.createElement('div'),
        prerender: false,
        children: {
          '/blog/:slug': {
            component: () => document.createElement('div'),
            generateParams: () => [{ slug: 'hello' }],
          },
          '/about': {
            component: () => document.createElement('div'),
            prerender: true,
          },
        },
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toContain('/app/blog/hello');
    expect(paths).toContain('/app/about');
    expect(paths).not.toContain('/app');
  });

  it('expands multiple params in a single route pattern', async () => {
    const routes = defineRoutes({
      '/users/:userId/posts/:postId': {
        component: () => document.createElement('div'),
        generateParams: () => [
          { userId: 'alice', postId: '1' },
          { userId: 'bob', postId: '2' },
        ],
      },
    });

    const paths = await collectPrerenderPaths(routes);

    expect(paths).toEqual(['/users/alice/posts/1', '/users/bob/posts/2']);
  });

  it('throws when generateParams returns incomplete params', async () => {
    const routes = defineRoutes({
      '/users/:userId/posts/:postId': {
        component: () => document.createElement('div'),
        generateParams: () => [{ userId: 'alice' }],
      },
    });

    await expect(collectPrerenderPaths(routes)).rejects.toThrow(/postId/);
  });

  it('throws when generateParams rejects', async () => {
    const routes = defineRoutes({
      '/blog/:slug': {
        component: () => document.createElement('div'),
        generateParams: async () => {
          throw new Error('CMS unavailable');
        },
      },
    });

    await expect(collectPrerenderPaths(routes)).rejects.toThrow('CMS unavailable');
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

  it('reports per-route errors via onRouteError and continues on remaining routes', async () => {
    // Module throws on the first call, succeeds afterwards. Mimics the
    // landing-page regression where a broken component at one route was
    // blocking pre-render of every other static route.
    let callCount = 0;
    const module = {
      default: () => {
        callCount += 1;
        if (callCount === 1) throw new Error('component crashed');
        const el = document.createElement('div');
        el.textContent = `rendered call #${callCount}`;
        return el;
      },
    };

    const errors: Array<{ path: string; message: string }> = [];
    const results = await prerenderRoutes(module, template, {
      routes: ['/', '/manifesto'],
      onRouteError: (path, error) => {
        errors.push({ path, message: error.message });
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('/');
    expect(errors[0]?.message).toMatch(/Pre-render failed for \//);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe('/manifesto');
  });
});
