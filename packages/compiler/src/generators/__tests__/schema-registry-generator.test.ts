import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, SchemaIR } from '../../ir/types';
import {
  buildSchemaRegistry,
  renderSchemaRegistryFile,
  SchemaRegistryGenerator,
} from '../schema-registry-generator';

function createMinimalIR(overrides?: Partial<AppIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    app: {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'src/app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
    ...overrides,
  };
}

function makeSchema(overrides: Partial<SchemaIR> & { name: string }): SchemaIR {
  return {
    sourceFile: 'src/schemas/test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    namingConvention: {},
    isNamed: true,
    ...overrides,
  };
}

describe('buildSchemaRegistry', () => {
  it('returns empty registry for app with no schemas', () => {
    const ir = createMinimalIR();
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas).toEqual([]);
  });

  it('includes only named schemas', () => {
    const ir = createMinimalIR({
      schemas: [
        makeSchema({ name: 'createUserBody', isNamed: true }),
        makeSchema({ name: 'inlineSchema', isNamed: false }),
      ],
    });
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas).toHaveLength(1);
    expect(registry.schemas[0].name).toBe('createUserBody');
  });

  it('includes schema id when present', () => {
    const ir = createMinimalIR({
      schemas: [makeSchema({ name: 'createUserBody', id: 'CreateUserBody' })],
    });
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas[0].id).toBe('CreateUserBody');
  });

  it('includes pre-computed JSON schema', () => {
    const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };
    const ir = createMinimalIR({
      schemas: [makeSchema({ name: 'createUserBody', jsonSchema })],
    });
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas[0].jsonSchema).toEqual(jsonSchema);
  });

  it('sorts schemas alphabetically by name', () => {
    const ir = createMinimalIR({
      schemas: [
        makeSchema({ name: 'readUserResponse' }),
        makeSchema({ name: 'createUserBody' }),
        makeSchema({ name: 'listUsersQuery' }),
      ],
    });
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas.map((s) => s.name)).toEqual([
      'createUserBody',
      'listUsersQuery',
      'readUserResponse',
    ]);
  });

  it('computes correct import paths from source files', () => {
    const ir = createMinimalIR({
      schemas: [
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/modules/user/schemas/create-user.schema.ts',
        }),
      ],
    });
    const registry = buildSchemaRegistry(ir);

    expect(registry.schemas[0].importPath).toBe('src/modules/user/schemas/create-user.schema.ts');
  });
});

describe('renderSchemaRegistryFile', () => {
  it('generates valid TypeScript with imports', () => {
    const manifest = {
      schemas: [
        {
          name: 'createUserBody',
          importPath: 'src/modules/user/schemas/create-user.schema.ts',
          variableName: 'createUserBody',
        },
      ],
    };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    expect(content).toContain('import { createUserBody }');
    expect(content).toContain('export const schemaRegistry');
  });

  it('groups imports by source file', () => {
    const manifest = {
      schemas: [
        {
          name: 'readUserParams',
          importPath: 'src/modules/user/schemas/read-user.schema.ts',
          variableName: 'readUserParams',
        },
        {
          name: 'readUserResponse',
          importPath: 'src/modules/user/schemas/read-user.schema.ts',
          variableName: 'readUserResponse',
        },
      ],
    };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    expect(content).toContain(
      "import { readUserParams, readUserResponse } from '../../src/modules/user/schemas/read-user.schema';",
    );
  });

  it('generates jsonSchemas export with pre-computed schemas', () => {
    const manifest = {
      schemas: [
        {
          name: 'createUserBody',
          importPath: 'src/schemas/user.ts',
          variableName: 'createUserBody',
          jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      ],
    };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    expect(content).toContain('export const jsonSchemas');
    expect(content).toContain('createUserBody:');
    expect(content).toContain('"type": "object"');
  });

  it('includes as const assertions', () => {
    const manifest = { schemas: [] };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    const asConstCount = (content.match(/as const/g) ?? []).length;
    expect(asConstCount).toBe(2);
  });

  it('includes auto-generated header comment', () => {
    const manifest = { schemas: [] };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    expect(content).toContain('Auto-generated by @vertz/compiler');
  });

  it('handles empty schema list', () => {
    const manifest = { schemas: [] };
    const content = renderSchemaRegistryFile(manifest, '.vertz/generated');

    expect(content).toContain('export const schemaRegistry = {\n} as const;');
    expect(content).toContain('export const jsonSchemas = {\n} as const;');
  });
});

describe('SchemaRegistryGenerator.generate', () => {
  it('writes schemas.ts to output directory', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-schemas-'));
    const generator = new SchemaRegistryGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);

    expect(existsSync(join(outputDir, 'schemas.ts'))).toBe(true);
  });

  it('file contains valid TypeScript', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-schemas-'));
    const generator = new SchemaRegistryGenerator(resolveConfig());
    const ir = createMinimalIR({
      schemas: [
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/modules/user/schemas/create-user.schema.ts',
        }),
      ],
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'schemas.ts'), 'utf-8');

    expect(content).toContain('export const schemaRegistry');
    expect(content).toContain('import { createUserBody }');
  });

  it('handles multiple schemas from same file', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-schemas-'));
    const generator = new SchemaRegistryGenerator(resolveConfig());
    const ir = createMinimalIR({
      schemas: [
        makeSchema({
          name: 'readUserParams',
          sourceFile: 'src/modules/user/schemas/read-user.schema.ts',
        }),
        makeSchema({
          name: 'readUserResponse',
          sourceFile: 'src/modules/user/schemas/read-user.schema.ts',
        }),
      ],
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'schemas.ts'), 'utf-8');

    expect(content).toContain('import { readUserParams, readUserResponse }');
  });

  it('handles schemas with complex JSON schemas', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-schemas-'));
    const generator = new SchemaRegistryGenerator(resolveConfig());
    const ir = createMinimalIR({
      schemas: [
        makeSchema({
          name: 'createUserBody',
          jsonSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name', 'email'],
          },
        }),
      ],
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'schemas.ts'), 'utf-8');

    expect(content).toContain('export const jsonSchemas');
    expect(content).toContain('"format": "email"');
  });
});
