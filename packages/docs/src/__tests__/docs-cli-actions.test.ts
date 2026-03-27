import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('docsInitAction', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `docs-cli-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('scaffolds a new docs project in the given directory', async () => {
    const { docsInitAction } = await import('../cli/actions');
    const result = await docsInitAction({ projectDir: testDir });

    expect(result.ok).toBe(true);
    expect(existsSync(join(testDir, 'vertz.config.ts'))).toBe(true);
    expect(existsSync(join(testDir, 'pages', 'index.mdx'))).toBe(true);
  });

  it('returns error when directory does not exist', async () => {
    const { docsInitAction } = await import('../cli/actions');
    const result = await docsInitAction({ projectDir: join(testDir, 'nonexistent') });

    expect(result.ok).toBe(false);
  });
});

describe('createDocsDevServer — static files', () => {
  let testDir: string;
  let server: { port: number; hostname: string; stop(): void } | null = null;

  beforeEach(() => {
    testDir = join(tmpdir(), `docs-dev-static-${Date.now()}`);
    mkdirSync(join(testDir, 'pages'), { recursive: true });
    mkdirSync(join(testDir, 'public'), { recursive: true });

    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test', sidebar: [{ tab: 'Guides', groups: [{ title: 'Default', pages: ['index'] }] }] };`,
    );
    writeFileSync(join(testDir, 'pages', 'index.mdx'), '# Hello\n');
    writeFileSync(join(testDir, 'public', 'favicon.svg'), '<svg>fav</svg>');
  });

  afterEach(() => {
    if (server) { server.stop(); server = null; }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('serves files from public/ directory', async () => {
    const { createDocsDevServer } = await import('../dev/docs-dev-server');
    server = await createDocsDevServer({ projectDir: testDir, port: 0 });
    const res = await fetch(`http://${server.hostname}:${server.port}/favicon.svg`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('<svg>fav</svg>');
  });

  it('returns 404 for files not in routes or public/', async () => {
    const { createDocsDevServer } = await import('../dev/docs-dev-server');
    server = await createDocsDevServer({ projectDir: testDir, port: 0 });
    const res = await fetch(`http://${server.hostname}:${server.port}/nonexistent.txt`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for directory paths in public/', async () => {
    mkdirSync(join(testDir, 'public', 'subdir'), { recursive: true });
    writeFileSync(join(testDir, 'public', 'subdir', 'file.txt'), 'nested');
    const { createDocsDevServer } = await import('../dev/docs-dev-server');
    server = await createDocsDevServer({ projectDir: testDir, port: 0 });
    const res = await fetch(`http://${server.hostname}:${server.port}/subdir`);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal attempts in static file serving', async () => {
    const { createDocsDevServer } = await import('../dev/docs-dev-server');
    server = await createDocsDevServer({ projectDir: testDir, port: 0 });
    const res = await fetch(`http://${server.hostname}:${server.port}/../package.json`);
    expect(res.status).toBe(404);
  });

  it('serves pages with extensionless sidebar paths', async () => {
    const { createDocsDevServer } = await import('../dev/docs-dev-server');
    server = await createDocsDevServer({ projectDir: testDir, port: 0 });
    const res = await fetch(`http://${server.hostname}:${server.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Hello');
  });
});

describe('docsBuildAction', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `docs-build-test-${Date.now()}`);
    mkdirSync(join(testDir, 'pages'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('builds docs and produces manifest', async () => {
    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test Docs', sidebar: [{ tab: 'Guides', groups: [{ title: 'Default', pages: ['index'] }] }] };`,
    );
    writeFileSync(join(testDir, 'pages', 'index.mdx'), '# Hello\n\nWelcome to docs.\n');

    const { docsBuildAction } = await import('../cli/actions');
    const result = await docsBuildAction({ projectDir: testDir });

    expect(result.ok).toBe(true);
    expect(existsSync(join(testDir, 'dist', 'manifest.json'))).toBe(true);
  });

  it('returns error when config is missing', async () => {
    const { docsBuildAction } = await import('../cli/actions');
    const result = await docsBuildAction({ projectDir: testDir });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('vertz.config.ts');
    }
  });

  it('accepts custom output directory', async () => {
    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test', sidebar: [{ tab: 'Guides', groups: [{ title: 'Default', pages: ['index'] }] }] };`,
    );
    writeFileSync(join(testDir, 'pages', 'index.mdx'), '# Test\n');

    const outputDir = join(testDir, 'custom-out');
    const { docsBuildAction } = await import('../cli/actions');
    const result = await docsBuildAction({ projectDir: testDir, outputDir });

    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'manifest.json'))).toBe(true);
  });

  it('generates LLM output when llm.enabled is true', async () => {
    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test', sidebar: [{ tab: 'Guides', groups: [{ title: 'Default', pages: ['index'] }] }], llm: { enabled: true, title: 'Test LLM' } };`,
    );
    writeFileSync(join(testDir, 'pages', 'index.mdx'), '# Test\n');

    const { docsBuildAction } = await import('../cli/actions');
    const result = await docsBuildAction({
      projectDir: testDir,
      baseUrl: 'https://docs.example.com',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(existsSync(join(testDir, 'dist', 'llms.txt'))).toBe(true);
      const llmsTxt = await Bun.file(join(testDir, 'dist', 'llms.txt')).text();
      expect(llmsTxt).toContain('https://docs.example.com');
    }
  });
});
