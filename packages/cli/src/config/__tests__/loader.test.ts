import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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

  it('returns defaults with compiler entryFile', async () => {
    const config = await loadConfig();
    expect(config.compiler?.entryFile).toBe('src/app.ts');
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
});
