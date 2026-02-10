import { describe, expect, it } from 'vitest';
import {
  emitBinEntryPoint,
  emitCommandDefinition,
  emitManifestFile,
  emitModuleCommands,
  scaffoldCLIPackageJson,
  scaffoldCLIRootIndex,
} from '../../generators/typescript/emit-cli';
import type { CodegenIR, CodegenModule, CodegenOperation } from '../../types';

// ── Fixture helpers ──────────────────────────────────────────────

function makeOp(overrides: Partial<CodegenOperation>): CodegenOperation {
  return {
    operationId: 'test',
    method: 'GET',
    path: '/test',
    tags: [],
    schemaRefs: {},
    ...overrides,
  };
}

function makeModule(overrides: Partial<CodegenModule>): CodegenModule {
  return {
    name: 'test',
    operations: [],
    ...overrides,
  };
}

function makeIR(overrides: Partial<CodegenIR>): CodegenIR {
  return {
    basePath: '/api/v1',
    modules: [],
    schemas: [],
    auth: { schemes: [] },
    ...overrides,
  };
}

// ── emitCommandDefinition ────────────────────────────────────────

describe('emitCommandDefinition', () => {
  it('generates a command definition from a simple GET operation', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        description: 'List all users',
      }),
    );

    expect(result).toContain("method: 'GET'");
    expect(result).toContain("path: '/api/v1/users'");
    expect(result).toContain("description: 'List all users'");
  });

  it('flattens path params to FieldDefinition entries with required: true', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'getUser',
        method: 'GET',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      }),
    );

    expect(result).toContain('params: {');
    expect(result).toContain("id: { type: 'string', required: true }");
  });

  it('flattens query params to FieldDefinition entries with required based on schema', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
          },
          required: ['page'],
        },
      }),
    );

    expect(result).toContain('query: {');
    expect(result).toContain("page: { type: 'number', required: true }");
    expect(result).toContain("limit: { type: 'number', required: false }");
  });

  it('flattens body fields to FieldDefinition entries', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'createUser',
        method: 'POST',
        path: '/api/v1/users',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name', 'email'],
        },
      }),
    );

    expect(result).toContain('body: {');
    expect(result).toContain("name: { type: 'string', required: true }");
    expect(result).toContain("email: { type: 'string', required: true }");
  });

  it('includes description in field definitions when present in schema', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: {
          type: 'object',
          properties: {
            page: { type: 'number', description: 'Page number' },
          },
        },
      }),
    );

    expect(result).toContain("description: 'Page number'");
  });

  it('includes enum values in field definitions when present', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
      }),
    );

    expect(result).toContain("enum: ['active', 'inactive']");
  });

  it('uses operationId as description fallback when no description provided', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
      }),
    );

    expect(result).toContain("description: 'listUsers'");
  });

  it('maps integer JSON schema type to number for CLI arg type', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'getUser',
        method: 'GET',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
      }),
    );

    expect(result).toContain("id: { type: 'number', required: true }");
  });

  it('maps boolean JSON schema type to boolean for CLI arg type', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: {
          type: 'object',
          properties: { verbose: { type: 'boolean' } },
        },
      }),
    );

    expect(result).toContain("verbose: { type: 'boolean', required: false }");
  });

  it('maps array and unknown types to string for CLI arg type', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'createUser',
        method: 'POST',
        path: '/api/v1/users',
        body: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
          },
        },
      }),
    );

    expect(result).toContain("tags: { type: 'string', required: false }");
    expect(result).toContain("metadata: { type: 'string', required: false }");
  });

  it('omits params/query/body sections when not present in the operation', () => {
    const result = emitCommandDefinition(
      makeOp({
        operationId: 'healthCheck',
        method: 'GET',
        path: '/api/v1/health',
      }),
    );

    expect(result).not.toContain('params:');
    expect(result).not.toContain('query:');
    expect(result).not.toContain('body:');
  });
});

// ── emitModuleCommands ───────────────────────────────────────────

describe('emitModuleCommands', () => {
  it('groups operations under the module name as a namespace', () => {
    const result = emitModuleCommands(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'listUsers',
            method: 'GET',
            path: '/api/v1/users',
            description: 'List users',
          }),
          makeOp({
            operationId: 'getUser',
            method: 'GET',
            path: '/api/v1/users/:id',
            description: 'Get a user',
            params: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
          }),
        ],
      }),
    );

    expect(result).toContain("'list-users': {");
    expect(result).toContain("'get-user': {");
    expect(result).toContain("method: 'GET'");
    expect(result).toContain("description: 'List users'");
    expect(result).toContain("description: 'Get a user'");
  });

  it('converts operationId to kebab-case for command names', () => {
    const result = emitModuleCommands(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'createNewUser',
            method: 'POST',
            path: '/api/v1/users',
            description: 'Create a new user',
            body: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        ],
      }),
    );

    expect(result).toContain("'create-new-user': {");
  });

  it('returns an empty object literal when module has no operations', () => {
    const result = emitModuleCommands(
      makeModule({
        name: 'empty',
        operations: [],
      }),
    );

    expect(result).toBe('{}');
  });
});

// ── emitManifestFile ─────────────────────────────────────────────

describe('emitManifestFile', () => {
  it('generates a manifest.ts file with CommandManifest type import', () => {
    const result = emitManifestFile(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/api/v1/users',
                description: 'List users',
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.path).toBe('cli/manifest.ts');
    expect(result.content).toContain('// Generated by @vertz/codegen');
    expect(result.content).toContain("import type { CommandManifest } from '@vertz/cli-runtime'");
  });

  it('exports a typed commands constant satisfying CommandManifest', () => {
    const result = emitManifestFile(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/api/v1/users',
                description: 'List users',
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain('export const commands: CommandManifest =');
  });

  it('groups commands by module name as namespace keys', () => {
    const result = emitManifestFile(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/api/v1/users',
                description: 'List users',
              }),
            ],
          }),
          makeModule({
            name: 'billing',
            operations: [
              makeOp({
                operationId: 'listInvoices',
                method: 'GET',
                path: '/api/v1/invoices',
                description: 'List invoices',
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain('users:');
    expect(result.content).toContain('billing:');
    expect(result.content).toContain("'list-users':");
    expect(result.content).toContain("'list-invoices':");
  });

  it('generates an empty manifest when IR has no modules', () => {
    const result = emitManifestFile(makeIR({ modules: [] }));

    expect(result.content).toContain('export const commands: CommandManifest = {}');
  });
});

// ── emitBinEntryPoint ────────────────────────────────────────────

describe('emitBinEntryPoint', () => {
  it('generates a bin.ts file with the auto-generated header', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '1.0.0',
    });

    expect(result.path).toBe('cli/bin.ts');
    expect(result.content).toContain('// Generated by @vertz/codegen');
  });

  it('imports createCLI from @vertz/cli-runtime', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '1.0.0',
    });

    expect(result.content).toContain("import { createCLI } from '@vertz/cli-runtime'");
  });

  it('imports the commands manifest from the manifest file', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '1.0.0',
    });

    expect(result.content).toContain("import { commands } from './manifest'");
  });

  it('creates CLI with the configured name and version', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '2.3.1',
    });

    expect(result.content).toContain("name: 'my-api'");
    expect(result.content).toContain("version: '2.3.1'");
  });

  it('invokes cli.run with process.argv.slice(2)', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '1.0.0',
    });

    expect(result.content).toContain('cli.run(process.argv.slice(2))');
  });

  it('includes a shebang line for node', () => {
    const result = emitBinEntryPoint({
      cliName: 'my-api',
      cliVersion: '1.0.0',
    });

    expect(result.content).toMatch(/^#!\/usr\/bin\/env/);
  });
});

// ── scaffoldCLIPackageJson ───────────────────────────────────────

describe('scaffoldCLIPackageJson', () => {
  it('generates a package.json for a publishable CLI package', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      packageVersion: '1.0.0',
      cliName: 'acme',
    });

    expect(result.path).toBe('package.json');
    const pkg = JSON.parse(result.content);
    expect(pkg.name).toBe('@acme/cli');
    expect(pkg.version).toBe('1.0.0');
  });

  it('includes a bin entry pointing to the generated bin file', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      packageVersion: '1.0.0',
      cliName: 'acme',
    });

    const pkg = JSON.parse(result.content);
    expect(pkg.bin).toEqual({ acme: './cli/bin.ts' });
  });

  it('includes @vertz/cli-runtime as a dependency', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      packageVersion: '1.0.0',
      cliName: 'acme',
    });

    const pkg = JSON.parse(result.content);
    expect(pkg.dependencies).toHaveProperty('@vertz/cli-runtime');
  });

  it('includes @vertz/fetch as a dependency', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      packageVersion: '1.0.0',
      cliName: 'acme',
    });

    const pkg = JSON.parse(result.content);
    expect(pkg.dependencies).toHaveProperty('@vertz/fetch');
  });

  it('defaults version to 0.0.0 when not provided', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      cliName: 'acme',
    });

    const pkg = JSON.parse(result.content);
    expect(pkg.version).toBe('0.0.0');
  });

  it('marks package as private', () => {
    const result = scaffoldCLIPackageJson({
      packageName: '@acme/cli',
      cliName: 'acme',
    });

    const pkg = JSON.parse(result.content);
    expect(pkg.private).toBe(true);
  });
});

// ── scaffoldCLIRootIndex ─────────────────────────────────────────

describe('scaffoldCLIRootIndex', () => {
  it('generates an index.ts that re-exports from the manifest', () => {
    const result = scaffoldCLIRootIndex();

    expect(result.path).toBe('index.ts');
    expect(result.content).toContain("export { commands } from './cli/manifest'");
  });

  it('includes the auto-generated header', () => {
    const result = scaffoldCLIRootIndex();

    expect(result.content).toContain('// Generated by @vertz/codegen');
  });
});

// ── Integration ──────────────────────────────────────────────────

describe('CLI generator integration', () => {
  it('generates a complete CLI package for an IR with multiple modules', () => {
    const ir = makeIR({
      modules: [
        makeModule({
          name: 'users',
          operations: [
            makeOp({
              operationId: 'listUsers',
              method: 'GET',
              path: '/api/v1/users',
              description: 'List all users',
              query: {
                type: 'object',
                properties: { page: { type: 'number', description: 'Page number' } },
              },
            }),
            makeOp({
              operationId: 'getUser',
              method: 'GET',
              path: '/api/v1/users/:id',
              description: 'Get a single user',
              params: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            }),
            makeOp({
              operationId: 'createUser',
              method: 'POST',
              path: '/api/v1/users',
              description: 'Create a new user',
              body: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
                required: ['name', 'email'],
              },
            }),
          ],
        }),
        makeModule({
          name: 'billing',
          operations: [
            makeOp({
              operationId: 'listInvoices',
              method: 'GET',
              path: '/api/v1/invoices',
              description: 'List invoices',
            }),
          ],
        }),
      ],
    });

    // Manifest
    const manifest = emitManifestFile(ir);
    expect(manifest.path).toBe('cli/manifest.ts');
    expect(manifest.content).toContain('users:');
    expect(manifest.content).toContain('billing:');
    expect(manifest.content).toContain("'list-users':");
    expect(manifest.content).toContain("'get-user':");
    expect(manifest.content).toContain("'create-user':");
    expect(manifest.content).toContain("'list-invoices':");

    // Bin entry
    const bin = emitBinEntryPoint({ cliName: 'my-api', cliVersion: '1.0.0' });
    expect(bin.path).toBe('cli/bin.ts');
    expect(bin.content).toContain("name: 'my-api'");
    expect(bin.content).toContain("import { commands } from './manifest'");

    // Package JSON
    const pkg = scaffoldCLIPackageJson({
      packageName: '@acme/my-api-cli',
      packageVersion: '1.0.0',
      cliName: 'my-api',
    });
    const parsed = JSON.parse(pkg.content);
    expect(parsed.name).toBe('@acme/my-api-cli');
    expect(parsed.bin).toEqual({ 'my-api': './cli/bin.ts' });

    // Root index
    const rootIndex = scaffoldCLIRootIndex();
    expect(rootIndex.content).toContain("export { commands } from './cli/manifest'");
  });
});
