import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CodegenConfig } from '../generate';
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
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/users-sdk',
      format: true,
    };

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
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/users-sdk',
      format: true,
    };

    await generate(makeAppIR(), config);

    // Read a generated file and check it has proper formatting (spaces, not tabs)
    const clientContent = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
    // Biome with our config uses 2-space indentation
    expect(clientContent).not.toContain('\t');
  });

  it('skips formatting when format is false', async () => {
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/users-sdk',
      format: false,
    };

    const result = await generate(makeAppIR(), config);

    // Files should still be generated
    expect(result.files.length).toBeGreaterThan(0);
    expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
  });

  it('generates package.json with the configured package name', async () => {
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/my-api-sdk',
      format: true,
    };

    await generate(makeAppIR(), config);

    const pkgPath = join(outputDir, 'package.json');
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.name).toBe('@acme/my-api-sdk');
  });

  it('returns file paths relative to the output directory', async () => {
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/sdk',
      format: false,
    };

    const result = await generate(makeAppIR(), config);

    // All returned file paths should be relative (not absolute)
    for (const file of result.files) {
      expect(file.path).not.toMatch(/^\//);
    }
  });

  it('includes the codegen IR in the result', async () => {
    const config: CodegenConfig = {
      outputDir,
      generators: ['typescript'],
      packageName: '@acme/sdk',
      format: false,
    };

    const result = await generate(makeAppIR(), config);

    expect(result.ir).toBeDefined();
    expect(result.ir.basePath).toBe('/api/v1');
    expect(result.ir.modules.length).toBe(1);
    expect(result.ir.modules[0].name).toBe('users');
  });
});
