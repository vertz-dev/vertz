import { describe, expect, it } from 'bun:test';
import { createSSRHandler } from '../ssr-handler';
import type { SSRModule } from '../ssr-shared';

const simpleModule: SSRModule = {
  default: () => {
    const el = document.createElement('div');
    el.textContent = 'Hello World';
    return el;
  },
};

const templateWithLang = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

describe('createSSRHandler — htmlAttributes', () => {
  it('injects attributes from callback onto <html> tag', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => ({ 'data-theme': 'dark' }),
    });

    const response = await handler(new Request('http://localhost/'));
    const html = await response.text();
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('lang="en"');
  });

  it('receives the request object and produces per-request attributes', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: (request) => {
        const url = new URL(request.url);
        const theme = url.searchParams.get('theme') ?? 'light';
        return { 'data-theme': theme };
      },
    });

    const light = await handler(new Request('http://localhost/?theme=light'));
    expect(await light.text()).toContain('data-theme="light"');

    const dark = await handler(new Request('http://localhost/?theme=dark'));
    expect(await dark.text()).toContain('data-theme="dark"');
  });

  it('overrides existing template attributes (merge semantics)', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => ({ lang: 'pt-BR' }),
    });

    const html = await (await handler(new Request('http://localhost/'))).text();
    expect(html).toContain('lang="pt-BR"');
    expect(html).not.toContain('lang="en"');
  });

  it('leaves template unchanged when callback returns null', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => null,
    });

    const html = await (await handler(new Request('http://localhost/'))).text();
    expect(html).toContain('<html lang="en">');
  });

  it('leaves template unchanged when callback returns undefined', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => undefined,
    });

    const html = await (await handler(new Request('http://localhost/'))).text();
    expect(html).toContain('<html lang="en">');
  });

  it('leaves template unchanged when callback returns empty object', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => ({}),
    });

    const html = await (await handler(new Request('http://localhost/'))).text();
    expect(html).toContain('<html lang="en">');
  });

  it('does not invoke callback for nav pre-fetch requests', async () => {
    let callCount = 0;
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => {
        callCount++;
        return { 'data-theme': 'dark' };
      },
    });

    await handler(
      new Request('http://localhost/', {
        headers: { 'X-Vertz-Nav': '1' },
      }),
    );
    expect(callCount).toBe(0);
  });

  it('returns 500 when htmlAttributes callback throws (invalid key)', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template: templateWithLang,
      htmlAttributes: () => ({ 'bad key': 'value' }),
    });

    const response = await handler(new Request('http://localhost/'));
    expect(response.status).toBe(500);
  });
});
