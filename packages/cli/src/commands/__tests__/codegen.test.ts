import type { CodegenConfig, CodegenIR, CodegenPipeline, IncrementalResult } from '@vertz/codegen';
import { describe, expect, it, vi } from 'vitest';
import { codegenAction } from '../codegen';

// ── Fixture helpers ──────────────────────────────────────────────

function makeIR(): CodegenIR {
  return {
    basePath: '/api/v1',
    modules: [
      {
        name: 'users',
        operations: [
          {
            operationId: 'listUsers',
            method: 'GET',
            path: '/api/v1/users',
            tags: [],
            schemaRefs: {},
          },
        ],
      },
    ],
    schemas: [],
    entities: [],
    auth: { schemes: [] },
  };
}

function makePipeline(overrides: Partial<CodegenPipeline> = {}): CodegenPipeline {
  return {
    validate: vi.fn().mockReturnValue([]),
    generate: vi.fn().mockReturnValue({
      files: [
        { path: 'client.ts', content: '// client' },
        { path: 'index.ts', content: '// index' },
        { path: 'types/users.ts', content: '// types' },
      ],
      fileCount: 3,
      generators: ['typescript'],
    }),
    resolveOutputDir: vi.fn().mockReturnValue('.vertz/generated'),
    resolveConfig: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<CodegenConfig> = {}): CodegenConfig {
  return {
    generators: ['typescript'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('codegenAction', () => {
  it('returns success when codegen config is valid and IR is provided', async () => {
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline: makePipeline(),
    });

    expect(result.success).toBe(true);
  });

  it('returns failure when codegen config is not provided', async () => {
    const result = await codegenAction({
      config: undefined,
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline: makePipeline(),
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('codegen');
  });

  it('returns failure when config validation fails', async () => {
    const pipeline = makePipeline({
      validate: vi.fn().mockReturnValue(['codegen.generators must contain at least one generator']),
    });

    const result = await codegenAction({
      config: makeConfig({ generators: [] }),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('generators');
  });

  it('calls writeFile for each generated file', async () => {
    const writeFile = vi.fn();
    await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile,
      pipeline: makePipeline(),
    });

    expect(writeFile).toHaveBeenCalledTimes(3);
  });

  it('writes files under the configured outputDir', async () => {
    const writeFile = vi.fn();
    const pipeline = makePipeline({
      resolveOutputDir: vi.fn().mockReturnValue('custom/output'),
    });

    await codegenAction({
      config: makeConfig({ outputDir: 'custom/output' }),
      ir: makeIR(),
      writeFile,
      pipeline,
    });

    for (const call of writeFile.mock.calls) {
      const filePath = call[0] as string;
      expect(filePath).toMatch(/^custom\/output\//);
    }
  });

  it('includes file count in the result', async () => {
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline: makePipeline(),
    });

    expect(result.fileCount).toBe(3);
  });

  it('includes success output message with file count', async () => {
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline: makePipeline(),
    });

    expect(result.output).toContain('Generated 3 files');
  });

  it('includes generator names in success output', async () => {
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline: makePipeline(),
    });

    expect(result.output).toContain('typescript');
  });

  it('supports dry-run mode without writing files', async () => {
    const writeFile = vi.fn();
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile,
      pipeline: makePipeline(),
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('returns failure when writeFile throws an error', async () => {
    const writeFile = vi.fn().mockRejectedValue(new Error('disk full'));
    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile,
      pipeline: makePipeline(),
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('disk full');
  });

  it('passes IR and config to pipeline.generate', async () => {
    const pipeline = makePipeline();
    const ir = makeIR();
    const config = makeConfig();

    await codegenAction({
      config,
      ir,
      writeFile: vi.fn(),
      pipeline,
    });

    expect(pipeline.generate).toHaveBeenCalledWith(ir, config);
  });

  it('passes config to pipeline.validate', async () => {
    const pipeline = makePipeline();
    const config = makeConfig();

    await codegenAction({
      config,
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline,
    });

    expect(pipeline.validate).toHaveBeenCalledWith(config);
  });

  it('generates CLI files when cli generator is configured', async () => {
    const writeFile = vi.fn();
    const pipeline = makePipeline({
      generate: vi.fn().mockReturnValue({
        files: [{ path: 'cli/manifest.ts', content: '// manifest' }],
        fileCount: 1,
        generators: ['cli'],
      }),
    });

    await codegenAction({
      config: makeConfig({ generators: ['cli'] }),
      ir: makeIR(),
      writeFile,
      pipeline,
    });

    const writtenPaths = writeFile.mock.calls.map((call: unknown[]) => call[0] as string);
    const hasManifest = writtenPaths.some((p: string) => p.includes('manifest'));
    expect(hasManifest).toBe(true);
  });

  it('returns singular file text for single file', async () => {
    const pipeline = makePipeline({
      generate: vi.fn().mockReturnValue({
        files: [{ path: 'manifest.ts', content: '// manifest' }],
        fileCount: 1,
        generators: ['cli'],
      }),
    });

    const result = await codegenAction({
      config: makeConfig(),
      ir: makeIR(),
      writeFile: vi.fn(),
      pipeline,
    });

    expect(result.output).toContain('Generated 1 file');
    expect(result.output).not.toContain('files');
  });

  // ── Incremental mode tests ──────────────────────────────────────

  describe('incremental mode', () => {
    function makeIncrementalPipeline(incremental: IncrementalResult) {
      return makePipeline({
        generate: vi.fn().mockReturnValue({
          files: [
            { path: 'client.ts', content: '// client' },
            { path: 'index.ts', content: '// index' },
            { path: 'types/users.ts', content: '// types' },
          ],
          fileCount: 3,
          generators: ['typescript'],
          incremental,
        }),
      });
    }

    it('shows written and skipped counts when incremental stats are present', async () => {
      const pipeline = makeIncrementalPipeline({
        written: ['client.ts'],
        skipped: ['index.ts', 'types/users.ts'],
        removed: [],
      });

      const result = await codegenAction({
        config: makeConfig(),
        ir: makeIR(),
        writeFile: vi.fn(),
        pipeline,
        incremental: true,
      });

      expect(result.output).toContain('1 written');
      expect(result.output).toContain('2 skipped');
    });

    it('shows removed count when files are removed', async () => {
      const pipeline = makeIncrementalPipeline({
        written: ['client.ts'],
        skipped: ['index.ts'],
        removed: ['types/old.ts'],
      });

      const result = await codegenAction({
        config: makeConfig(),
        ir: makeIR(),
        writeFile: vi.fn(),
        pipeline,
        incremental: true,
      });

      expect(result.output).toContain('1 removed');
    });

    it('does not show incremental stats when incremental is false', async () => {
      const pipeline = makeIncrementalPipeline({
        written: ['client.ts'],
        skipped: ['index.ts', 'types/users.ts'],
        removed: [],
      });

      const result = await codegenAction({
        config: makeConfig(),
        ir: makeIR(),
        writeFile: vi.fn(),
        pipeline,
        incremental: false,
      });

      expect(result.output).not.toContain('written');
      expect(result.output).not.toContain('skipped');
      expect(result.output).toContain('Generated 3 files');
    });

    it('shows all files as written on first run', async () => {
      const pipeline = makeIncrementalPipeline({
        written: ['client.ts', 'index.ts', 'types/users.ts'],
        skipped: [],
        removed: [],
      });

      const result = await codegenAction({
        config: makeConfig(),
        ir: makeIR(),
        writeFile: vi.fn(),
        pipeline,
        incremental: true,
      });

      expect(result.output).toContain('3 written');
      expect(result.output).not.toContain('skipped');
    });

    it('defaults incremental to true', async () => {
      const pipeline = makeIncrementalPipeline({
        written: ['client.ts'],
        skipped: ['index.ts', 'types/users.ts'],
        removed: [],
      });

      // Not passing incremental option — should default to true
      const result = await codegenAction({
        config: makeConfig(),
        ir: makeIR(),
        writeFile: vi.fn(),
        pipeline,
      });

      expect(result.output).toContain('1 written');
      expect(result.output).toContain('2 skipped');
    });
  });
});
