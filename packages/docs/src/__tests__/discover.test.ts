import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverPages } from '../generator/discover';

describe('discoverPages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `docs-test-${Date.now()}`);
    mkdirSync(join(tempDir, 'guides'), { recursive: true });
    writeFileSync(join(tempDir, 'index.mdx'), '# Home');
    writeFileSync(join(tempDir, 'quickstart.mdx'), '# Quickstart');
    writeFileSync(join(tempDir, 'guides', 'advanced.mdx'), '# Advanced');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds all .mdx files in the pages directory', async () => {
    const pages = await discoverPages(tempDir);
    expect(pages).toHaveLength(3);
  });

  it('returns relative paths from the pages root', async () => {
    const pages = await discoverPages(tempDir);
    const paths = pages.map((p) => p.relativePath).sort();
    expect(paths).toEqual(['guides/advanced.mdx', 'index.mdx', 'quickstart.mdx']);
  });

  it('includes the absolute path for each file', async () => {
    const pages = await discoverPages(tempDir);
    const indexPage = pages.find((p) => p.relativePath === 'index.mdx');
    expect(indexPage?.absolutePath).toBe(join(tempDir, 'index.mdx'));
  });

  it('returns empty array for non-existent directory', async () => {
    const pages = await discoverPages(join(tempDir, 'nonexistent'));
    expect(pages).toEqual([]);
  });

  it('ignores non-.mdx files', async () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Readme');
    writeFileSync(join(tempDir, 'config.ts'), 'export default {}');
    const pages = await discoverPages(tempDir);
    expect(pages).toHaveLength(3);
  });
});
