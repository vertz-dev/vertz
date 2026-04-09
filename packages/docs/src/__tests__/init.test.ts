import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDocs } from '../cli/init';

describe('initDocs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `docs-init-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates vertz.config.ts', async () => {
    await initDocs(tempDir);
    expect(existsSync(join(tempDir, 'vertz.config.ts'))).toBe(true);
  });

  it('creates pages/index.mdx', async () => {
    await initDocs(tempDir);
    expect(existsSync(join(tempDir, 'pages', 'index.mdx'))).toBe(true);
  });

  it('creates pages/quickstart.mdx', async () => {
    await initDocs(tempDir);
    expect(existsSync(join(tempDir, 'pages', 'quickstart.mdx'))).toBe(true);
  });

  it('does not overwrite existing config', async () => {
    const configPath = join(tempDir, 'vertz.config.ts');
    await Bun.write(configPath, 'export default { name: "Existing" }');
    await initDocs(tempDir);
    const content = await Bun.file(configPath).text();
    expect(content).toContain('Existing');
  });

  it('config contains defineDocsConfig import', async () => {
    await initDocs(tempDir);
    const content = await Bun.file(join(tempDir, 'vertz.config.ts')).text();
    expect(content).toContain('defineDocsConfig');
  });
});
