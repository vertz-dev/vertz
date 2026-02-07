import { describe, expect, it } from 'vitest';
import { defineConfig, resolveConfig } from '../config';

describe('defineConfig', () => {
  it('returns the same config object (identity function)', () => {
    const input = { strict: true };
    expect(defineConfig(input)).toBe(input);
  });
});

describe('resolveConfig', () => {
  it('with no arguments returns all defaults', () => {
    const config = resolveConfig();
    expect(config.strict).toBe(false);
    expect(config.forceGenerate).toBe(false);
    expect(config.compiler.sourceDir).toBe('src');
    expect(config.compiler.outputDir).toBe('.vertz/generated');
    expect(config.compiler.entryFile).toBe('src/app.ts');
    expect(config.compiler.schemas.enforceNaming).toBe(true);
    expect(config.compiler.schemas.enforcePlacement).toBe(true);
    expect(config.compiler.openapi.output).toBe('.vertz/generated/openapi.json');
    expect(config.compiler.openapi.info.title).toBe('Vertz API');
    expect(config.compiler.openapi.info.version).toBe('1.0.0');
    expect(config.compiler.validation.requireResponseSchema).toBe(true);
    expect(config.compiler.validation.detectDeadCode).toBe(true);
  });

  it('merges user overrides with defaults', () => {
    const config = resolveConfig({ strict: true, compiler: { sourceDir: 'app' } });
    expect(config.strict).toBe(true);
    expect(config.compiler.sourceDir).toBe('app');
    expect(config.compiler.outputDir).toBe('.vertz/generated');
  });

  it('merges nested partial objects', () => {
    const config = resolveConfig({ compiler: { schemas: { enforceNaming: false } } });
    expect(config.compiler.schemas.enforceNaming).toBe(false);
    expect(config.compiler.schemas.enforcePlacement).toBe(true);
  });

  it('with undefined input returns defaults', () => {
    const config = resolveConfig(undefined);
    expect(config.strict).toBe(false);
    expect(config.compiler.sourceDir).toBe('src');
  });

  it('with empty object returns defaults', () => {
    const config = resolveConfig({});
    expect(config.strict).toBe(false);
    expect(config.compiler.sourceDir).toBe('src');
  });
});
