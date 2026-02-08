import { describe, expect, it } from 'vitest';
import { defaultCLIConfig, defineConfig } from '../defaults.js';

describe('defineConfig', () => {
  it('returns the config object passed to it', () => {
    const input = { strict: true };
    const result = defineConfig(input);
    expect(result).toEqual(input);
  });
});

describe('defaultCLIConfig', () => {
  it('has strict set to false', () => {
    expect(defaultCLIConfig.strict).toBe(false);
  });

  it('has forceGenerate set to false', () => {
    expect(defaultCLIConfig.forceGenerate).toBe(false);
  });

  it('has compiler.sourceDir set to "src"', () => {
    expect(defaultCLIConfig.compiler.sourceDir).toBe('src');
  });

  it('has compiler.outputDir set to ".vertz/generated"', () => {
    expect(defaultCLIConfig.compiler.outputDir).toBe('.vertz/generated');
  });

  it('has compiler.entryFile set to "src/app.ts"', () => {
    expect(defaultCLIConfig.compiler.entryFile).toBe('src/app.ts');
  });

  it('has dev.port set to 3000', () => {
    expect(defaultCLIConfig.dev.port).toBe(3000);
  });

  it('has dev.host set to "localhost"', () => {
    expect(defaultCLIConfig.dev.host).toBe('localhost');
  });

  it('has dev.open set to false', () => {
    expect(defaultCLIConfig.dev.open).toBe(false);
  });

  it('has dev.typecheck set to true', () => {
    expect(defaultCLIConfig.dev.typecheck).toBe(true);
  });

  it('has generators as an empty object', () => {
    expect(defaultCLIConfig.generators).toEqual({});
  });
});
