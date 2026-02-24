import { describe, expect, it } from 'bun:test';
import { defaultCLIConfig } from '../defaults';

describe('defaultCLIConfig', () => {
  it('has strict set to false', () => {
    expect(defaultCLIConfig.strict).toBe(false);
  });

  it('has forceGenerate set to false', () => {
    expect(defaultCLIConfig.forceGenerate).toBe(false);
  });

  it('has compiler.sourceDir set to src', () => {
    expect(defaultCLIConfig.compiler?.sourceDir).toBe('src');
  });

  it('has compiler.entryFile set to src/app.ts', () => {
    expect(defaultCLIConfig.compiler?.entryFile).toBe('src/app.ts');
  });

  it('has compiler.outputDir set to .vertz/generated', () => {
    expect(defaultCLIConfig.compiler?.outputDir).toBe('.vertz/generated');
  });

  it('has dev.port set to 3000', () => {
    expect(defaultCLIConfig.dev?.port).toBe(3000);
  });

  it('has dev.host set to localhost', () => {
    expect(defaultCLIConfig.dev?.host).toBe('localhost');
  });

  it('has dev.open set to false', () => {
    expect(defaultCLIConfig.dev?.open).toBe(false);
  });

  it('has dev.typecheck set to true', () => {
    expect(defaultCLIConfig.dev?.typecheck).toBe(true);
  });

  it('has empty generators object', () => {
    expect(defaultCLIConfig.generators).toEqual({});
  });

  it('is a frozen-shape object with expected keys', () => {
    const keys = Object.keys(defaultCLIConfig).sort();
    expect(keys).toEqual(['compiler', 'dev', 'forceGenerate', 'generators', 'strict'].sort());
  });
});
