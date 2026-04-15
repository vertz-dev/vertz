import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocsConfig } from '../config/load';

// vtz runtime does not support query-string cache busting in dynamic import() paths
const isVtzRuntime = '__vtz_runtime' in globalThis;

describe.skipIf(isVtzRuntime)('loadDocsConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `docs-config-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads config from vertz.config.ts', async () => {
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default { name: 'Test Docs', sidebar: [{ tab: 'Main', groups: [{ title: 'Intro', pages: ['index.mdx'] }] }] };`,
    );
    const config = await loadDocsConfig(tempDir);
    expect(config.name).toBe('Test Docs');
  });

  it('throws when no config file exists', async () => {
    expect(loadDocsConfig(tempDir)).rejects.toThrow('No vertz.config.ts found');
  });

  it('resolves sidebar from config', async () => {
    writeFileSync(
      join(tempDir, 'vertz.config.ts'),
      `export default { name: 'Docs', sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx'] }] }] };`,
    );
    const config = await loadDocsConfig(tempDir);
    expect(config.sidebar).toHaveLength(1);
    expect(config.sidebar[0]?.tab).toBe('Guides');
  });

  it('throws when config exports a non-object', async () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), 'export default 42;');
    expect(loadDocsConfig(tempDir)).rejects.toThrow('must export a default config object');
  });

  it('throws when config exports null', async () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), 'export default null;');
    expect(loadDocsConfig(tempDir)).rejects.toThrow('must export a default config object');
  });

  it('throws when config is missing name', async () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), 'export default { sidebar: [] };');
    expect(loadDocsConfig(tempDir)).rejects.toThrow('must have a "name" string field');
  });

  it('throws when config is missing sidebar', async () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), `export default { name: 'Test' };`);
    expect(loadDocsConfig(tempDir)).rejects.toThrow('must have a "sidebar" array field');
  });
});
