import { describe, expect, it } from 'bun:test';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, SchemaIR } from '../../ir/types';
import { PlacementValidator } from '../placement-validator';

function makeSchema(overrides: Partial<SchemaIR> & { name: string }): SchemaIR {
  return {
    sourceFile: 'src/modules/user/schemas/create-user.schema.ts',
    sourceLine: 1,
    sourceColumn: 1,
    namingConvention: {},
    isNamed: true,
    ...overrides,
  };
}

function makeIR(schemas: SchemaIR[]): AppIR {
  return { ...createEmptyAppIR(), schemas };
}

describe('PlacementValidator', () => {
  describe('file placement', () => {
    it('no diagnostics for correctly placed schemas', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/modules/user/schemas/create-user.schema.ts',
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits warning for schema not in schemas/ folder', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({ name: 'createUserBody', sourceFile: 'src/modules/user/create-user.ts' }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.code).toBe('VERTZ_SCHEMA_PLACEMENT');
      expect(diags.at(0)?.severity).toBe('warning');
      expect(diags.at(0)?.suggestion).toContain('schemas/');
    });

    it('emits warning for schema without .schema.ts suffix', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({ name: 'userTypes', sourceFile: 'src/modules/user/schemas/user-types.ts' }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.code).toBe('VERTZ_SCHEMA_PLACEMENT');
      expect(diags.at(0)?.suggestion).toContain('.schema.ts');
    });

    it('handles schema in nested schemas/ folder', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({
          name: 'loginBody',
          sourceFile: 'src/modules/user/schemas/auth/login.schema.ts',
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('handles schemas at project root schemas/ folder', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({ name: 'sharedBody', sourceFile: 'src/schemas/shared.schema.ts' }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });
  });

  describe('one schema file per endpoint', () => {
    it('no diagnostics when schema file exports match one endpoint', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/schemas/create-user.schema.ts',
          namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
        }),
        makeSchema({
          name: 'createUserResponse',
          sourceFile: 'src/schemas/create-user.schema.ts',
          namingConvention: { operation: 'create', entity: 'User', part: 'Response' },
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits warning when schema file exports mix operations', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/schemas/user.schema.ts',
          namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
        }),
        makeSchema({
          name: 'readUserResponse',
          sourceFile: 'src/schemas/user.schema.ts',
          namingConvention: { operation: 'read', entity: 'User', part: 'Response' },
        }),
      ]);
      const diags = await validator.validate(ir);
      const mixedOps = diags.filter((d) => d.message.includes('operation'));
      expect(mixedOps).toHaveLength(1);
      expect(mixedOps.at(0)?.code).toBe('VERTZ_SCHEMA_PLACEMENT');
    });

    it('emits warning when schema file exports mix entities', async () => {
      const validator = new PlacementValidator();
      const ir = makeIR([
        makeSchema({
          name: 'createUserBody',
          sourceFile: 'src/schemas/schemas.ts',
          namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
        }),
        makeSchema({
          name: 'createTodoBody',
          sourceFile: 'src/schemas/schemas.ts',
          namingConvention: { operation: 'create', entity: 'Todo', part: 'Body' },
        }),
      ]);
      const diags = await validator.validate(ir);
      const mixedEntities = diags.filter((d) => d.message.includes('entit'));
      expect(mixedEntities).toHaveLength(1);
      expect(mixedEntities.at(0)?.code).toBe('VERTZ_SCHEMA_PLACEMENT');
    });
  });
});
