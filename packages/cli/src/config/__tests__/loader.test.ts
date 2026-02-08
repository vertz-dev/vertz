import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultCLIConfig } from '../defaults.js';
import { findConfigFile, loadConfig } from '../loader.js';

const FIXTURES_BASE = join(import.meta.dirname, '__fixtures__');
let testDir: string;
let testId = 0;

function createTestDir(): string {
  testId++;
  const dir = join(FIXTURES_BASE, `test-${testId}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('findConfigFile', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    rmSync(FIXTURES_BASE, { recursive: true, force: true });
  });

  it('returns null when no config file exists', () => {
    const result = findConfigFile(testDir);
    expect(result).toBeNull();
  });

  it('discovers vertz.config.ts in the given directory', () => {
    const configPath = join(testDir, 'vertz.config.ts');
    writeFileSync(configPath, 'export default {}');
    const result = findConfigFile(testDir);
    expect(result).toBe(configPath);
  });

  it('walks up parent directories to find config file', () => {
    const configPath = join(testDir, 'vertz.config.ts');
    writeFileSync(configPath, 'export default {}');
    const nestedDir = join(testDir, 'src', 'modules', 'user');
    mkdirSync(nestedDir, { recursive: true });
    const result = findConfigFile(nestedDir);
    expect(result).toBe(configPath);
  });

  it('supports vertz.config.js as an alternative', () => {
    const configPath = join(testDir, 'vertz.config.js');
    writeFileSync(configPath, 'module.exports = {}');
    const result = findConfigFile(testDir);
    expect(result).toBe(configPath);
  });

  it('supports vertz.config.mjs as an alternative', () => {
    const configPath = join(testDir, 'vertz.config.mjs');
    writeFileSync(configPath, 'export default {}');
    const result = findConfigFile(testDir);
    expect(result).toBe(configPath);
  });

  it('prefers vertz.config.ts over .js when both exist', () => {
    const tsPath = join(testDir, 'vertz.config.ts');
    const jsPath = join(testDir, 'vertz.config.js');
    writeFileSync(tsPath, 'export default {}');
    writeFileSync(jsPath, 'module.exports = {}');
    const result = findConfigFile(testDir);
    expect(result).toBe(tsPath);
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    rmSync(FIXTURES_BASE, { recursive: true, force: true });
  });

  it('returns default config when no config file exists', async () => {
    const config = await loadConfig('/tmp/nonexistent-dir-vertz-test');
    expect(config).toEqual(defaultCLIConfig);
  });

  it('merges user config with defaults, user values override', async () => {
    const configContent = `export default { strict: true, dev: { port: 4000 } };`;
    writeFileSync(join(testDir, 'vertz.config.ts'), configContent);
    const config = await loadConfig(testDir);
    expect(config.strict).toBe(true);
    expect(config.dev.port).toBe(4000);
    expect(config.dev.host).toBe('localhost');
    expect(config.compiler.sourceDir).toBe('src');
  });

  it('handles export default defineConfig({...}) format', async () => {
    const configContent = [
      'function defineConfig(config) { return config; }',
      'export default defineConfig({ strict: true, compiler: { outputDir: "build" } });',
    ].join('\n');
    writeFileSync(join(testDir, 'vertz.config.ts'), configContent);
    const config = await loadConfig(testDir);
    expect(config.strict).toBe(true);
    expect(config.compiler.outputDir).toBe('build');
    expect(config.compiler.sourceDir).toBe('src');
  });

  it('handles plain export default {...} format', async () => {
    const configContent = `export default { compiler: { entryFile: "src/main.ts" } };`;
    writeFileSync(join(testDir, 'vertz.config.ts'), configContent);
    const config = await loadConfig(testDir);
    expect(config.compiler.entryFile).toBe('src/main.ts');
    expect(config.strict).toBe(false);
  });
});

describe('loadConfig integration', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    rmSync(FIXTURES_BASE, { recursive: true, force: true });
  });

  it('loads vertz.config.ts from project root and returns validated config', async () => {
    const configContent = [
      'function defineConfig(config) { return config; }',
      'export default defineConfig({',
      '  strict: true,',
      '  compiler: {',
      '    sourceDir: "src",',
      '    outputDir: "dist/generated",',
      '    entryFile: "src/main.ts",',
      '  },',
      '  dev: {',
      '    port: 4000,',
      '    host: "0.0.0.0",',
      '  },',
      '});',
    ].join('\n');
    writeFileSync(join(testDir, 'vertz.config.ts'), configContent);

    const nestedDir = join(testDir, 'src', 'modules');
    mkdirSync(nestedDir, { recursive: true });

    const config = await loadConfig(nestedDir);

    expect(config.strict).toBe(true);
    expect(config.forceGenerate).toBe(false);
    expect(config.compiler.sourceDir).toBe('src');
    expect(config.compiler.outputDir).toBe('dist/generated');
    expect(config.compiler.entryFile).toBe('src/main.ts');
    expect(config.dev.port).toBe(4000);
    expect(config.dev.host).toBe('0.0.0.0');
    expect(config.dev.open).toBe(false);
    expect(config.dev.typecheck).toBe(true);
    expect(config.generators).toEqual({});
  });
});
