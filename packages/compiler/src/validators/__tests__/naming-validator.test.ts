import { describe, expect, it } from 'vitest';
import type { Validator } from '../../compiler';
import type { Diagnostic } from '../../errors';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, SchemaIR } from '../../ir/types';
import type { ParsedSchemaName, ValidOperation, ValidPart } from '../naming-validator';
import { NamingValidator } from '../naming-validator';

function makeSchema(overrides: Partial<SchemaIR> & { name: string }): SchemaIR {
  return {
    sourceFile: 'src/schemas/test.schema.ts',
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

describe('NamingValidator', () => {
  describe('parseSchemaName', () => {
    it('parses valid name: createUserBody', () => {
      const validator = new NamingValidator();
      const result = validator.parseSchemaName('createUserBody');
      expect(result).toEqual({ operation: 'create', entity: 'User', part: 'Body' });
    });

    it('parses valid name: readUserResponse', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('readUserResponse')).toEqual({
        operation: 'read',
        entity: 'User',
        part: 'Response',
      });
    });

    it('parses valid name: listTodosQuery', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('listTodosQuery')).toEqual({
        operation: 'list',
        entity: 'Todos',
        part: 'Query',
      });
    });

    it('parses valid name: updatePostParams', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('updatePostParams')).toEqual({
        operation: 'update',
        entity: 'Post',
        part: 'Params',
      });
    });

    it('parses valid name: deleteCommentHeaders', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('deleteCommentHeaders')).toEqual({
        operation: 'delete',
        entity: 'Comment',
        part: 'Headers',
      });
    });

    it('parses multi-word entity: createBlogPostBody', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('createBlogPostBody')).toEqual({
        operation: 'create',
        entity: 'BlogPost',
        part: 'Body',
      });
    });

    it('returns null operation for invalid prefix: getUserBody', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('getUserBody')).toEqual({
        operation: null,
        entity: null,
        part: null,
      });
    });

    it('returns null part for invalid suffix: createUserRequest', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('createUserRequest')).toEqual({
        operation: 'create',
        entity: null,
        part: null,
      });
    });

    it('returns null for completely invalid name: userSchema', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('userSchema')).toEqual({
        operation: null,
        entity: null,
        part: null,
      });
    });

    it('returns null for empty string', () => {
      const validator = new NamingValidator();
      expect(validator.parseSchemaName('')).toEqual({
        operation: null,
        entity: null,
        part: null,
      });
    });
  });

  describe('validate', () => {
    it('no diagnostics for validly named schemas', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([
        makeSchema({
          name: 'createUserBody',
          namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
        }),
        makeSchema({
          name: 'readUserResponse',
          namingConvention: { operation: 'read', entity: 'User', part: 'Response' },
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits warning for schema with invalid naming', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([makeSchema({ name: 'userSchema' })]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.severity).toBe('warning');
      expect(diags.at(0)?.code).toBe('VERTZ_SCHEMA_NAMING');
      expect(diags.at(0)?.message).toContain('userSchema');
      expect(diags.at(0)?.message).toContain('{operation}{Entity}{Part}');
    });

    it('emits warning with correct source location', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([
        makeSchema({
          name: 'userSchema',
          sourceFile: 'src/schemas/user.ts',
          sourceLine: 5,
          sourceColumn: 1,
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.file).toBe('src/schemas/user.ts');
      expect(diags.at(0)?.line).toBe(5);
      expect(diags.at(0)?.column).toBe(1);
    });

    it('skips unnamed/inline schemas', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([makeSchema({ name: 'badName', isNamed: false })]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('validates all schemas in the IR', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([
        makeSchema({ name: 'createUserBody' }),
        makeSchema({ name: 'readUserResponse' }),
        makeSchema({ name: 'badName' }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
    });

    it('emits warning for wrong operation casing: CreateUserBody', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([makeSchema({ name: 'CreateUserBody' })]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.suggestion).toContain('createUserBody');
    });

    it('emits warning for wrong entity casing: createuserBody', async () => {
      const validator = new NamingValidator();
      const ir = makeIR([makeSchema({ name: 'createuserBody' })]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.suggestion).toContain('createUserBody');
    });
  });

  describe('type-level tests', () => {
    it('Validator interface enforces correct return type', () => {
      // @ts-expect-error — validate must return Promise<Diagnostic[]>, not Promise<string>
      const _bad: Validator = {
        validate: (_ir: AppIR): Promise<string> => Promise.resolve('nope'),
      };
    });

    it('Validator interface enforces correct parameter type', () => {
      // @ts-expect-error — validate must accept AppIR, not string
      const _bad: Validator = {
        validate: (_ir: string): Promise<Diagnostic[]> => Promise.resolve([]),
      };
    });

    it('ValidOperation is a string literal union', () => {
      // @ts-expect-error — 'get' is not a valid operation
      const _bad: ValidOperation = 'get';
    });

    it('ValidPart is a string literal union', () => {
      // @ts-expect-error — 'Request' is not a valid part
      const _bad: ValidPart = 'Request';
    });

    it('ParsedSchemaName fields are nullable with null not undefined', () => {
      // @ts-expect-error — undefined is not assignable to string | null
      const _bad: ParsedSchemaName = { operation: undefined, entity: 'User', part: 'Body' };
    });
  });
});
