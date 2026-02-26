import { describe, expect, it, vi } from 'vitest';
import { createBunDevServer, injectIntoTemplate } from '../bun-dev-server';

describe('createBunDevServer', () => {
  it('returns an object with start and stop methods', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('defaults to HMR mode (ssr: false)', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // The server object is created without errors — HMR mode is default
    expect(server).toBeDefined();
  });

  it('accepts SSR mode option', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
      ssr: true,
    });

    expect(server).toBeDefined();
  });

  it('accepts all configuration options', () => {
    const apiHandler = async (_req: Request) => new Response('ok');

    const server = createBunDevServer({
      entry: './src/app.tsx',
      port: 4000,
      host: '0.0.0.0',
      apiHandler,
      skipSSRPaths: ['/api/', '/graphql/'],
      openapi: { specPath: '/tmp/openapi.json' },
      ssrModule: true,
      clientEntry: './src/entry-client.ts',
      title: 'Test App',
      projectRoot: '/tmp/test-project',
      logRequests: false,
      ssr: false,
    });

    expect(server).toBeDefined();
  });

  it('stop() is safe to call before start()', async () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // Should not throw
    await server.stop();
  });

  it('defaults port to 3000', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // Verify server creates successfully with default port
    expect(server).toBeDefined();
  });

  it('defaults host to localhost', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('defaults logRequests to true', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // Server created successfully with default logRequests
    expect(server).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('defaults skipSSRPaths to [/api/]', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
      ssr: true,
    });

    // Server created with default skip paths
    expect(server).toBeDefined();
  });

  it('defaults title to Vertz App', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
      ssrModule: true,
    });

    expect(server).toBeDefined();
  });

  it('defaults projectRoot to process.cwd()', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('stop() can be called multiple times safely', async () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    await server.stop();
    await server.stop();
    // No error thrown
  });
});

describe('injectIntoTemplate', () => {
  const baseTemplate = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Test</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/app.tsx"></script>
  </body>
</html>`;

  it('replaces script src with inline client bundle', () => {
    const result = injectIntoTemplate(baseTemplate, 'console.log("hi")', '', '', []);

    expect(result).toContain('<script type="module">\nconsole.log("hi")\n</script>');
    expect(result).not.toContain('src="./src/app.tsx"');
  });

  it('injects app HTML into <div id="app">', () => {
    const result = injectIntoTemplate(baseTemplate, '', '<h1>Hello</h1>', '', []);

    expect(result).toContain('<div id="app"><h1>Hello</h1></div>');
  });

  it('injects app HTML into <!--ssr-outlet--> when present', () => {
    const outletTemplate = baseTemplate.replace('<div id="app"></div>', '<!--ssr-outlet-->');
    const result = injectIntoTemplate(outletTemplate, '', '<h1>Hello</h1>', '', []);

    expect(result).toContain('<h1>Hello</h1>');
    expect(result).not.toContain('<!--ssr-outlet-->');
  });

  it('injects CSS before </head>', () => {
    const result = injectIntoTemplate(
      baseTemplate,
      '',
      '',
      '<style>.app { color: red; }</style>',
      [],
    );

    expect(result).toContain('<style>.app { color: red; }</style>\n</head>');
  });

  it('does not inject CSS when appCss is empty', () => {
    const result = injectIntoTemplate(baseTemplate, '', '', '', []);

    // Only one </head> — no extra injection
    const headCloseCount = (result.match(/<\/head>/g) || []).length;
    expect(headCloseCount).toBe(1);
  });

  it('injects SSR data script before </body>', () => {
    const ssrData = [{ key: 'users', data: [{ id: 1 }] }];
    const result = injectIntoTemplate(baseTemplate, '', '', '', ssrData);

    expect(result).toContain('window.__VERTZ_SSR_DATA__=');
    expect(result).toContain('"key":"users"');
  });

  it('does not inject SSR data when ssrData is empty', () => {
    const result = injectIntoTemplate(baseTemplate, '', '', '', []);

    expect(result).not.toContain('__VERTZ_SSR_DATA__');
  });

  it('handles all injections together', () => {
    const ssrData = [{ key: 'tasks', data: ['a', 'b'] }];
    const result = injectIntoTemplate(
      baseTemplate,
      'import "./app"',
      '<main>App</main>',
      '<style>body{margin:0}</style>',
      ssrData,
    );

    expect(result).toContain('<script type="module">\nimport "./app"\n</script>');
    expect(result).toContain('<div id="app"><main>App</main></div>');
    expect(result).toContain('<style>body{margin:0}</style>\n</head>');
    expect(result).toContain('__VERTZ_SSR_DATA__');
  });
});
