import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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
});
