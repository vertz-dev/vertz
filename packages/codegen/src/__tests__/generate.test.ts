import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedCodegenConfig } from '../config';
import { resolveCodegenConfig } from '../config';
import { generate } from '../generate';

// ── Minimal AppIR fixture ──────────────────────────────────────────

function makeAppIR(overrides?: Partial<AppIR>): AppIR {
  return {
    app: {
      basePath: '/api/v1',
      version: '1.0.0',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
    modules: [
      {
        name: 'users',
        imports: [],
        services: [],
        exports: [],
        routers: [
          {
            name: 'usersRouter',
            moduleName: 'users',
            prefix: '/users',
            inject: [],
            routes: [
              {
                method: 'GET',
                path: '/',
                fullPath: '/api/v1/users',
                operationId: 'listUsers',
                middleware: [],
                tags: ['users'],
                description: 'List all users',
                query: {
                  kind: 'inline',
                  sourceFile: 'users.ts',
                  jsonSchema: {
                    type: 'object',
                    properties: {
                      page: { type: 'number' },
                      limit: { type: 'number' },
                    },
                  },
                },
                sourceFile: 'users.ts',
                sourceLine: 10,
                sourceColumn: 1,
              },
              {
                method: 'POST',
                path: '/',
                fullPath: '/api/v1/users',
                operationId: 'createUser',
                middleware: [],
                tags: ['users'],
                description: 'Create a user',
                body: {
                  kind: 'inline',
                  sourceFile: 'users.ts',
                  jsonSchema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                    required: ['name', 'email'],
                  },
                },
                response: {
                  kind: 'inline',
                  sourceFile: 'users.ts',
                  jsonSchema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                    required: ['id', 'name', 'email'],
                  },
                },
                sourceFile: 'users.ts',
                sourceLine: 20,
                sourceColumn: 1,
              },
            ],
            sourceFile: 'users.ts',
            sourceLine: 5,
            sourceColumn: 1,
          },
        ],
        sourceFile: 'users.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ],
    middleware: [],
    schemas: [],
    dependencyGraph: {
      nodes: [],
      edges: [],
      initializationOrder: [],
      circularDependencies: [],
    },
    diagnostics: [],
    ...overrides,
  };
}

describe('generate', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-generate-test-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates TypeScript SDK files and writes them to disk', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: true,
    });

    const result = await generate(makeAppIR(), config);

    // Should return the list of generated files
    expect(result.files.length).toBeGreaterThan(0);

    // index.ts barrel should exist
    const indexPath = join(outputDir, 'index.ts');
    expect(existsSync(indexPath)).toBe(true);

    // client.ts should exist
    const clientPath = join(outputDir, 'client.ts');
    expect(existsSync(clientPath)).toBe(true);

    // types files should exist
    const usersTypesPath = join(outputDir, 'types', 'users.ts');
    expect(existsSync(usersTypesPath)).toBe(true);
  });

  it('formats generated files with Biome when format is enabled', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: true,
    });

    await generate(makeAppIR(), config);

    // Read a generated file and check it has proper formatting (spaces, not tabs)
    const clientContent = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
    // Biome with our config uses 2-space indentation
    expect(clientContent).not.toContain('\t');
  });

  it('skips formatting when format is false', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    // Files should still be generated
    expect(result.files.length).toBeGreaterThan(0);
    expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
  });

  it('returns file paths relative to the output directory', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    // All returned file paths should be relative (not absolute)
    for (const file of result.files) {
      expect(file.path).not.toMatch(/^\//);
    }
  });

  it('includes the codegen IR in the result', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    expect(result.ir).toBeDefined();
    expect(result.ir.basePath).toBe('/api/v1');
    expect(result.ir.modules.length).toBe(1);
    expect(result.ir.modules[0].name).toBe('users');
  });

  it('includes generator names and file count in the result', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    expect(result.generators).toContain('typescript');
    expect(result.fileCount).toBe(result.files.length);
  });

  it('generates CLI manifest when cli generator is included', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['cli'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('cli/manifest.ts');
    expect(result.generators).toContain('cli');
  });

  it('generates both SDK and CLI files when both generators are configured', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript', 'cli'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('client.ts');
    expect(paths).toContain('cli/manifest.ts');
    expect(result.generators).toContain('typescript');
    expect(result.generators).toContain('cli');
  });

  // ── Incremental mode tests ──────────────────────────────────────

  describe('incremental mode', () => {
    it('returns incremental stats by default', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });

      const result = await generate(makeAppIR(), config);

      // Incremental is on by default — all files should be written (first run)
      expect(result.incremental).toBeDefined();
      expect(result.incremental?.written.length).toBe(result.files.length);
      expect(result.incremental?.skipped.length).toBe(0);
    });

    it('skips unchanged files on second run', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });

      // First run — writes everything
      await generate(makeAppIR(), config);

      // Second run with identical input — should skip everything
      const result2 = await generate(makeAppIR(), config);

      expect(result2.incremental).toBeDefined();
      expect(result2.incremental?.written.length).toBe(0);
      expect(result2.incremental?.skipped.length).toBe(result2.files.length);
    });

    it('does not return incremental stats when incremental is false', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
        incremental: false,
      });

      const result = await generate(makeAppIR(), config);

      // When incremental is disabled, no incremental result
      expect(result.incremental).toBeUndefined();
    });
  });
});
