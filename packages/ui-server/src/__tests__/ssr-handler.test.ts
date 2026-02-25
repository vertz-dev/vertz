import { defineTheme } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { registerSSRQuery } from '../ssr-context';
import { createSSRHandler } from '../ssr-handler';
import type { SSRModule } from '../ssr-render';

const simpleModule: SSRModule = {
  default: () => {
    const el = document.createElement('div');
    el.textContent = 'Hello World';
    return el;
  },
};

const template = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

describe('createSSRHandler', () => {
  it('returns SSR HTML for normal requests', async () => {
    const handler = createSSRHandler({ module: simpleModule, template });
    const request = new Request('http://localhost/');
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');

    const html = await response.text();
    expect(html).toContain('Hello World');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('injects app HTML into <!--ssr-outlet-->, CSS before </head>, ssrData before </body>', async () => {
    const theme = defineTheme({
      colors: { primary: { DEFAULT: '#3b82f6' } },
    });

    let callCount = 0;
    const moduleWithQuery: SSRModule = {
      default: () => {
        callCount++;
        if (callCount === 1) {
          registerSSRQuery({
            key: 'items',
            promise: Promise.resolve([1, 2, 3]),
            timeout: 300,
            resolve: () => {},
          });
        }
        const el = document.createElement('div');
        el.textContent = 'Content';
        return el;
      },
      theme,
    };

    const handler = createSSRHandler({ module: moduleWithQuery, template });
    const response = await handler(new Request('http://localhost/'));
    const html = await response.text();

    // App HTML replaces <!--ssr-outlet-->
    expect(html).not.toContain('<!--ssr-outlet-->');
    expect(html).toContain('Content');

    // CSS injected before </head>
    expect(html).toContain('--color-primary');
    const headCloseIdx = html.indexOf('</head>');
    const cssIdx = html.indexOf('--color-primary');
    expect(cssIdx).toBeLessThan(headCloseIdx);

    // SSR data injected before </body>
    expect(html).toContain('__VERTZ_SSR_DATA__');
    const bodyCloseIdx = html.indexOf('</body>');
    const dataIdx = html.indexOf('__VERTZ_SSR_DATA__');
    expect(dataIdx).toBeLessThan(bodyCloseIdx);
  });

  it('falls back to <div id="app"> replacement when no <!--ssr-outlet-->', async () => {
    const templateNoOutlet = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><div id="app"></div></body>
</html>`;

    const handler = createSSRHandler({ module: simpleModule, template: templateNoOutlet });
    const response = await handler(new Request('http://localhost/'));
    const html = await response.text();

    expect(html).toContain('<div id="app"><div>Hello World</div></div>');
  });

  it('returns SSE for nav pre-fetch requests', async () => {
    const moduleWithQuery: SSRModule = {
      default: () => {
        registerSSRQuery({
          key: 'nav-data',
          promise: Promise.resolve({ id: 42 }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const handler = createSSRHandler({ module: moduleWithQuery, template });
    const request = new Request('http://localhost/tasks/42', {
      headers: { 'X-Vertz-Nav': '1' },
    });
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');

    const body = await response.text();
    expect(body).toContain('event: data');
    expect(body).toContain('"nav-data"');
    expect(body).toContain('event: done');
    expect(body).toContain('data: {}');
  });

  it('safe-serializes SSE data containing <', async () => {
    const moduleWithScript: SSRModule = {
      default: () => {
        registerSSRQuery({
          key: 'html-data',
          promise: Promise.resolve({ html: '<script>alert("xss")</script>' }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const handler = createSSRHandler({ module: moduleWithScript, template });
    const request = new Request('http://localhost/', {
      headers: { 'X-Vertz-Nav': '1' },
    });
    const response = await handler(request);
    const body = await response.text();

    // '<' should be escaped as \u003c
    expect(body).not.toContain('<script>alert');
    expect(body).toContain('\\u003c');
  });

  it('returns 500 for SSR render errors', async () => {
    const brokenModule: SSRModule = {
      default: () => {
        throw new Error('Render crash');
      },
    };

    const handler = createSSRHandler({ module: brokenModule, template });
    const response = await handler(new Request('http://localhost/'));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe('Internal Server Error');
  });

  it('returns graceful SSE done event when nav discovery crashes', async () => {
    const brokenModule: SSRModule = {
      default: () => {
        throw new Error('Discovery crash');
      },
    };

    const handler = createSSRHandler({ module: brokenModule, template });
    const request = new Request('http://localhost/', {
      headers: { 'X-Vertz-Nav': '1' },
    });
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const body = await response.text();
    expect(body).toContain('event: done');
    expect(body).toContain('data: {}');
  });
});
