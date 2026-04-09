import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConfigFile, loadConfig } from '../loader';

describe('findConfigFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `vertz-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns undefined when no config file exists', () => {
    expect(findConfigFile(tempDir)).toBeUndefined();
  });

  it('finds vertz.config.ts', () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), 'export default {}');
    const result = findConfigFile(tempDir);
    expect(result).toBe(join(tempDir, 'vertz.config.ts'));
  });

  it('finds vertz.config.js', () => {
    writeFileSync(join(tempDir, 'vertz.config.js'), 'module.exports = {}');
    const result = findConfigFile(tempDir);
    expect(result).toBe(join(tempDir, 'vertz.config.js'));
  });

  it('prefers .ts over .js', () => {
    writeFileSync(join(tempDir, 'vertz.config.ts'), 'export default {}');
    writeFileSync(join(tempDir, 'vertz.config.js'), 'module.exports = {}');
    const result = findConfigFile(tempDir);
    expect(result).toBe(join(tempDir, 'vertz.config.ts'));
  });

  it('finds vertz.config.mjs', () => {
    writeFileSync(join(tempDir, 'vertz.config.mjs'), 'export default {}');
    const result = findConfigFile(tempDir);
    expect(result).toBe(join(tempDir, 'vertz.config.mjs'));
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config path is provided', async () => {
    const config = await loadConfig();
    expect(config.strict).toBe(false);
    expect(config.forceGenerate).toBe(false);
  });

  it('returns defaults with compiler sourceDir', async () => {
    const config = await loadConfig();
    expect(config.compiler?.sourceDir).toBe('src');
  });

  it('returns defaults with compiler outputDir', async () => {
    const config = await loadConfig();
    expect(config.compiler?.outputDir).toBe('.vertz/generated');
  });

  it('returns an object with expected shape', async () => {
    const config = await loadConfig();
    expect(config).toHaveProperty('strict');
    expect(config).toHaveProperty('compiler');
  });

  it('loads and merges a real config file with default export', async () => {
    const dir = join(
      tmpdir(),
      `vertz-cfg-merge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'vertz.config.ts'),
      `export default { strict: true, compiler: { sourceDir: 'lib' } };`,
    );

    try {
      const config = await loadConfig(join(dir, 'vertz.config.ts'));
      // User override
      expect(config.strict).toBe(true);
      // Deep-merged: user's sourceDir wins
      expect(config.compiler?.sourceDir).toBe('lib');
      // Deep-merged: defaults preserved for un-overridden keys
      expect(config.compiler?.outputDir).toBe('.vertz/generated');
      // Non-overridden top-level default
      expect(config.forceGenerate).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads config with named export (no default)', async () => {
    const dir = join(
      tmpdir(),
      `vertz-cfg-named-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'vertz.config.ts'), `export const strict = true;`);

    try {
      const config = await loadConfig(join(dir, 'vertz.config.ts'));
      // When module has no `default` key, the whole module object is used as config
      // It should still be merged with defaults
      expect(config.compiler?.sourceDir).toBe('src');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deep-merges nested objects without overwriting sibling keys', async () => {
    const dir = join(
      tmpdir(),
      `vertz-cfg-deep-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'vertz.config.ts'),
      `export default { compiler: { sourceDir: 'app' } };`,
    );

    try {
      const config = await loadConfig(join(dir, 'vertz.config.ts'));
      expect(config.compiler?.sourceDir).toBe('app');
      // Other compiler keys should remain from defaults
      expect(config.compiler?.outputDir).toBe('.vertz/generated');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
