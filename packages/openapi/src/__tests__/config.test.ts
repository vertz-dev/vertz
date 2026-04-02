import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig, loadConfigFile, resolveConfig } from '../config';

describe('resolveConfig', () => {
  it('applies defaults for missing values', () => {
    const config = resolveConfig({ from: 'spec.json' });
    expect(config.source).toBe('spec.json');
    expect(config.output).toBe('./src/generated');
    expect(config.baseURL).toBe('');
    expect(config.groupBy).toBe('tag');
    expect(config.schemas).toBe(false);
  });

  it('maps --from flag to source', () => {
    const config = resolveConfig({ from: 'api.yaml' });
    expect(config.source).toBe('api.yaml');
  });

  it('CLI flags override config file values', () => {
    const config = resolveConfig(
      { from: 'cli-spec.json', output: './cli-output' },
      { source: 'config-spec.json', output: './config-output', schemas: true },
    );
    expect(config.source).toBe('cli-spec.json');
    expect(config.output).toBe('./cli-output');
    expect(config.schemas).toBe(true); // from config, not overridden by CLI
  });

  it('uses config file values as fallback', () => {
    const config = resolveConfig(
      {},
      { source: 'config-spec.json', output: './config-output', schemas: true },
    );
    expect(config.source).toBe('config-spec.json');
    expect(config.output).toBe('./config-output');
    expect(config.schemas).toBe(true);
  });

  it('throws when source is missing from both CLI and config', () => {
    expect(() => resolveConfig({})).toThrow('source');
  });

  it('prefers source over from in CLI flags', () => {
    const config = resolveConfig({ source: 'direct.json' });
    expect(config.source).toBe('direct.json');
  });
});

describe('defineConfig', () => {
  it('is a passthrough type helper', () => {
    const input = { source: 'spec.json', output: './gen' };
    expect(defineConfig(input)).toBe(input);
  });
});

describe('loadConfigFile', () => {
  const tmpDir = join(import.meta.dir, '__tmp_config_test__');

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when no config file exists', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const result = await loadConfigFile(tmpDir);
    expect(result).toBeUndefined();
  });

  it('loads config from openapi.config.ts', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'openapi.config.ts'),
      `export default { source: 'from-config.json', schemas: true };`,
    );
    const result = await loadConfigFile(tmpDir);
    expect(result).toBeDefined();
    expect(result!.source).toBe('from-config.json');
    expect(result!.schemas).toBe(true);
  });
});
