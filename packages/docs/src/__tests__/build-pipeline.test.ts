import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocs } from '../generator/build-pipeline';

describe('buildDocs', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `docs-build-${Date.now()}`);
    outDir = join(tempDir, 'dist');
    mkdirSync(join(tempDir, 'pages'), { recursive: true });

    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default {
  name: 'Test Docs',
  sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx'] }] }],
  llm: { enabled: true, title: 'Test Docs', description: 'Test' },
};`,
    );

    writeFileSync(
      join(tempDir, 'pages', 'index.mdx'),
      `# Welcome

## Getting Started

This is the home page.

## Next Steps

Check the guides.
`,
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates output directory', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(outDir)).toBe(true);
  });

  it('generates LLM markdown files when enabled', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'llms', 'home.md'))).toBe(true);
  });

  it('generates llms.txt index', async () => {
    await buildDocs({ projectDir: tempDir, outDir, baseUrl: 'https://docs.example.com' });
    expect(existsSync(join(outDir, 'llms.txt'))).toBe(true);
    const content = await Bun.file(join(outDir, 'llms.txt')).text();
    expect(content).toContain('# Test Docs');
    expect(content).toContain('home.md');
  });

  it('generates llms-full.txt concatenated file', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'llms-full.txt'))).toBe(true);
    const content = await Bun.file(join(outDir, 'llms-full.txt')).text();
    expect(content).toContain('# Welcome');
  });

  it('skips LLM output when disabled', async () => {
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default {
  name: 'No LLM',
  sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx'] }] }],
};`,
    );
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'llms.txt'))).toBe(false);
  });

  it('generates a manifest with route metadata', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(await Bun.file(join(outDir, 'manifest.json')).text());
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].path).toBe('/');
    expect(manifest.routes[0].headings).toHaveLength(2);
  });

  it('uses frontmatter title when available', async () => {
    writeFileSync(
      join(tempDir, 'pages', 'index.mdx'),
      `---
title: Custom Home Title
---

# Welcome

Content here.
`,
    );
    const result = await buildDocs({ projectDir: tempDir, outDir });
    expect(result.routes[0]?.title).toBe('Custom Home Title');
  });

  it('falls back to filename-derived title when no frontmatter', async () => {
    const result = await buildDocs({ projectDir: tempDir, outDir });
    expect(result.routes[0]?.title).toBe('Index');
  });

  it('generates HTML files for each page', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    const html = await Bun.file(join(outDir, 'index.html')).text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Welcome');
  });

  it('generates HTML with correct title and meta tags', async () => {
    writeFileSync(
      join(tempDir, 'pages', 'index.mdx'),
      `---
title: Custom Title
description: A custom description for SEO.
---

# Custom Title

Page content.
`,
    );
    await buildDocs({ projectDir: tempDir, outDir });
    const html = await Bun.file(join(outDir, 'index.html')).text();
    expect(html).toContain('<title>Custom Title - Test Docs</title>');
    expect(html).toContain('A custom description for SEO.');
  });

  it('generates sitemap.xml listing all pages', async () => {
    await buildDocs({ projectDir: tempDir, outDir, baseUrl: 'https://docs.example.com' });
    expect(existsSync(join(outDir, 'sitemap.xml'))).toBe(true);
    const sitemap = await Bun.file(join(outDir, 'sitemap.xml')).text();
    expect(sitemap).toContain('<?xml');
    expect(sitemap).toContain('https://docs.example.com/');
  });

  it('generates robots.txt', async () => {
    await buildDocs({ projectDir: tempDir, outDir, baseUrl: 'https://docs.example.com' });
    expect(existsSync(join(outDir, 'robots.txt'))).toBe(true);
    const robots = await Bun.file(join(outDir, 'robots.txt')).text();
    expect(robots).toContain('Sitemap: https://docs.example.com/sitemap.xml');
  });

  it('generates redirect HTML for configured redirects', async () => {
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default {
  name: 'Test Docs',
  sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx'] }] }],
  redirects: [{ source: '/old-page', destination: '/new-page' }],
};`,
    );
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'old-page', 'index.html'))).toBe(true);
    const html = await Bun.file(join(outDir, 'old-page', 'index.html')).text();
    expect(html).toContain('/new-page');
    expect(html).toContain('http-equiv="refresh"');
  });

  it('excludes pages matching llm.exclude patterns', async () => {
    mkdirSync(join(tempDir, 'pages', 'internal'), { recursive: true });
    writeFileSync(join(tempDir, 'pages', 'internal', 'debug.mdx'), '# Debug\n\nInternal page.\n');
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default {
  name: 'Test Docs',
  sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx', 'internal/debug.mdx'] }] }],
  llm: { enabled: true, title: 'Test', description: 'Test', exclude: ['internal/**'] },
};`,
    );
    await buildDocs({ projectDir: tempDir, outDir });
    // LLM output for excluded page should not exist
    expect(existsSync(join(outDir, 'llms', 'internal/debug.md'))).toBe(false);
    // But HTML should still be generated
    expect(existsSync(join(outDir, 'internal/debug.html'))).toBe(true);
    // llms.txt should not list excluded page
    const llmsTxt = await Bun.file(join(outDir, 'llms.txt')).text();
    expect(llmsTxt).not.toContain('debug');
  });

  it('adds enriched frontmatter to LLM markdown output', async () => {
    writeFileSync(
      join(tempDir, 'pages', 'index.mdx'),
      `---
title: Getting Started
description: Learn how to get started with Vertz.
---

# Getting Started

Content here.
`,
    );
    await buildDocs({ projectDir: tempDir, outDir, baseUrl: 'https://docs.example.com' });
    const llmMd = await Bun.file(join(outDir, 'llms', 'home.md')).text();
    // Enriched frontmatter includes title, description, category, and url
    expect(llmMd).toContain('title: Getting Started');
    expect(llmMd).toContain('description: Learn how to get started with Vertz.');
    expect(llmMd).toContain('category: Start');
    expect(llmMd).toContain('url: https://docs.example.com/');
  });

  it('enriches LLM frontmatter even when source has no frontmatter', async () => {
    await buildDocs({ projectDir: tempDir, outDir, baseUrl: 'https://docs.example.com' });
    const llmMd = await Bun.file(join(outDir, 'llms', 'home.md')).text();
    // Even without source frontmatter, the build injects category and url
    expect(llmMd).toContain('category: Start');
    expect(llmMd).toContain('url: https://docs.example.com/');
    expect(llmMd).toContain('title: Index');
  });

  it('copies public/ directory to dist/ when it exists', async () => {
    const publicDir = join(tempDir, 'public');
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'favicon.svg'), '<svg>icon</svg>');
    mkdirSync(join(publicDir, 'logo'), { recursive: true });
    writeFileSync(join(publicDir, 'logo', 'dark.svg'), '<svg>dark</svg>');

    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'favicon.svg'))).toBe(true);
    expect(existsSync(join(outDir, 'logo', 'dark.svg'))).toBe(true);
    const content = await Bun.file(join(outDir, 'favicon.svg')).text();
    expect(content).toBe('<svg>icon</svg>');
  });

  it('skips public copy when public/ does not exist', async () => {
    await buildDocs({ projectDir: tempDir, outDir });
    // Should succeed without error even without public/
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
  });

  it('generates HTML for nested page paths', async () => {
    mkdirSync(join(tempDir, 'pages', 'guides'), { recursive: true });
    writeFileSync(
      join(tempDir, 'pages', 'guides', 'advanced.mdx'),
      `# Advanced Guide

Deep content.
`,
    );
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default {
  name: 'Test Docs',
  sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx', 'guides/advanced.mdx'] }] }],
};`,
    );
    await buildDocs({ projectDir: tempDir, outDir });
    expect(existsSync(join(outDir, 'guides', 'advanced.html'))).toBe(true);
  });
});
