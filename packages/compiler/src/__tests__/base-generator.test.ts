import { describe, expect, it } from 'vitest';
import { BaseGenerator } from '../generators/base-generator';
import { resolveConfig } from '../config';
import type { AppIR } from '../ir/types';

class TestGenerator extends BaseGenerator {
  async generate(_ir: AppIR, _outputDir: string): Promise<void> {
    // no-op
  }

  testResolveOutputPath(outputDir: string, fileName: string): string {
    return this.resolveOutputPath(outputDir, fileName);
  }
}

describe('BaseGenerator', () => {
  it('resolveOutputPath joins outputDir and fileName', () => {
    const gen = new TestGenerator(resolveConfig());
    expect(gen.testResolveOutputPath('/project/.vertz/generated', 'openapi.json')).toBe(
      '/project/.vertz/generated/openapi.json',
    );
  });

  it('resolveOutputPath handles nested fileName', () => {
    const gen = new TestGenerator(resolveConfig());
    expect(gen.testResolveOutputPath('/project/out', 'schemas/registry.ts')).toBe(
      '/project/out/schemas/registry.ts',
    );
  });

  it('stores config', () => {
    const config = resolveConfig({ strict: true });
    const gen = new TestGenerator(config);
    expect(gen['config']).toBe(config);
  });
});
