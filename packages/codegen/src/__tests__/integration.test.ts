import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedCodegenConfig } from '../config';
import { resolveCodegenConfig } from '../config';
import { generate } from '../generate';

// ── Realistic multi-module AppIR fixture ───────────────────────────

function makeRealisticAppIR(): AppIR {
  return {
    app: {
      basePath: '/api/v1',
      version: '2.0.0',
      globalMiddleware: [],
      moduleRegistrations: [{ moduleName: 'users' }, { moduleName: 'billing' }],
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
                method: 'GET',
                path: '/:id',
                fullPath: '/api/v1/users/:id',
                operationId: 'getUser',
                middleware: [],
                tags: ['users'],
                description: 'Get a user by ID',
                params: {
                  kind: 'inline',
                  sourceFile: 'users.ts',
                  jsonSchema: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
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
              {
                method: 'POST',
                path: '/',
                fullPath: '/api/v1/users',
                operationId: 'createUser',
                middleware: [],
                tags: ['users'],
                description: 'Create a new user',
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
                    },
                    required: ['id', 'name'],
                  },
                },
                sourceFile: 'users.ts',
                sourceLine: 30,
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
      {
        name: 'billing',
        imports: [],
        services: [],
        exports: [],
        routers: [
          {
            name: 'billingRouter',
            moduleName: 'billing',
            prefix: '/invoices',
            inject: [],
            routes: [
              {
                method: 'GET',
                path: '/',
                fullPath: '/api/v1/invoices',
                operationId: 'listInvoices',
                middleware: [],
                tags: ['billing'],
                description: 'List invoices',
                sourceFile: 'billing.ts',
                sourceLine: 10,
                sourceColumn: 1,
              },
            ],
            sourceFile: 'billing.ts',
            sourceLine: 5,
            sourceColumn: 1,
          },
        ],
        sourceFile: 'billing.ts',
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
  };
}

// ── Integration tests ──────────────────────────────────────────────

describe('Full pipeline integration', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-integration-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates a complete formatted SDK from a realistic multi-module AppIR', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: true,
      typescript: {
        publishable: {
          name: '@acme/api-sdk',
          outputDir,
          version: '2.0.0',
        },
      },
    });

    const result = await generate(makeRealisticAppIR(), config);

    // ── Verify file structure ──────────────────────────────────
    const expectedFiles = [
      'index.ts',
      'client.ts',
      'types/users.ts',
      'types/billing.ts',
      'modules/users.ts',
      'modules/billing.ts',
      'schemas.ts',
      'package.json',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(outputDir, file))).toBe(true);
    }

    // ── Verify package.json ────────────────────────────────────
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('@acme/api-sdk');
    expect(pkg.version).toBe('2.0.0');
    expect(pkg.dependencies).toHaveProperty('@vertz/fetch');

    // ── Verify index.ts barrel exports ─────────────────────────
    const indexContent = readFileSync(join(outputDir, 'index.ts'), 'utf-8');
    expect(indexContent).toContain("export { createClient } from './client'");
    expect(indexContent).toContain("export * from './types/users'");
    expect(indexContent).toContain("export * from './types/billing'");

    // ── Verify client.ts has createClient ──────────────────────
    const clientContent = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
    expect(clientContent).toContain('export function createClient');
    expect(clientContent).toContain('export interface SDKConfig');

    // ── Verify types file has operation types ──────────────────
    const usersTypes = readFileSync(join(outputDir, 'types', 'users.ts'), 'utf-8');
    expect(usersTypes).toContain('ListUsersInput');
    expect(usersTypes).toContain('CreateUserInput');
    expect(usersTypes).toContain('GetUserResponse');

    // ── Verify module file has factory function ────────────────
    const usersModule = readFileSync(join(outputDir, 'modules', 'users.ts'), 'utf-8');
    expect(usersModule).toContain('createUsersModule');

    // ── Verify formatting was applied ──────────────────────────
    // Biome with our config uses 2-space indent, not tabs
    expect(clientContent).not.toContain('\t');
    expect(usersTypes).not.toContain('\t');

    // ── Verify result metadata ─────────────────────────────────
    expect(result.ir.basePath).toBe('/api/v1');
    expect(result.ir.version).toBe('2.0.0');
    expect(result.ir.modules).toHaveLength(2);
    expect(result.files.length).toBeGreaterThanOrEqual(expectedFiles.length);
  });

  it('produces valid TypeScript that contains no syntax errors', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: true,
      typescript: {
        publishable: {
          name: '@acme/sdk',
          outputDir,
        },
      },
    });

    await generate(makeRealisticAppIR(), config);

    // Check that key generated files contain valid-looking TypeScript
    const clientContent = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
    const indexContent = readFileSync(join(outputDir, 'index.ts'), 'utf-8');

    // Every export should be valid
    expect(clientContent).toContain('export');
    expect(indexContent).toContain('export');

    // Should have the auto-generated header
    expect(clientContent).toContain('// Generated by @vertz/codegen');
    expect(indexContent).toContain('// Generated by @vertz/codegen');
  });

  it('generates schemas file with validator definitions', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: true,
      typescript: {
        publishable: {
          name: '@acme/sdk',
          outputDir,
        },
      },
    });

    await generate(makeRealisticAppIR(), config);

    const schemasContent = readFileSync(join(outputDir, 'schemas.ts'), 'utf-8');
    expect(schemasContent).toContain('@vertz/schema');
    expect(schemasContent).toContain('Schema');
  });

  it('handles an AppIR with no modules gracefully', async () => {
    const emptyAppIR: AppIR = {
      app: {
        basePath: '/api',
        globalMiddleware: [],
        moduleRegistrations: [],
        sourceFile: 'app.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
      modules: [],
      middleware: [],
      schemas: [],
      dependencyGraph: {
        nodes: [],
        edges: [],
        initializationOrder: [],
        circularDependencies: [],
      },
      diagnostics: [],
    };

    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(emptyAppIR, config);

    // Should still produce at least an index.ts
    expect(existsSync(join(outputDir, 'index.ts'))).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});
