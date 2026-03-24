import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocsConfig } from '../config/load';

describe('loadDocsConfig', () => {
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
});
