import { describe, expect, it } from '@vertz/test';
import type { Expression } from 'ts-morph';
import { Project } from 'ts-morph';
import { resolveSchemaRefFromExpression } from '../utils/schema-type-resolver';

function buildTargetFile(source: string): Expression {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('/src/test.ts', source);
  const decl = file.getVariableDeclarationOrThrow('target');
  return decl.getInitializerOrThrow();
}

describe('Feature: schema-type-resolver', () => {
  describe('Given an Identifier referencing a SchemaLike<T> constant', () => {
    describe('When resolveSchemaRefFromExpression runs', () => {
      it('Then returns kind "inline" with resolvedFields matching T', () => {
        const expr = buildTargetFile(
          `export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
const schema: SchemaLike<{ foo: string }> = {} as SchemaLike<{ foo: string }>;
export const target = schema;`,
        );
        const ref = resolveSchemaRefFromExpression(expr);
        expect(ref.kind).toBe('inline');
        if (ref.kind === 'inline') {
          expect(ref.resolvedFields).toEqual([{ name: 'foo', tsType: 'string', optional: false }]);
        }
      });

      it('Then returns jsonSchema with type "object" and property types mapped', () => {
        const expr = buildTargetFile(
          `export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
const schema: SchemaLike<{ foo: string; count: number }> = {} as SchemaLike<{ foo: string; count: number }>;
export const target = schema;`,
        );
        const ref = resolveSchemaRefFromExpression(expr);
        if (ref.kind === 'inline') {
          expect(ref.jsonSchema).toEqual({
            type: 'object',
            properties: {
              foo: { type: 'string' },
              count: { type: 'number' },
            },
            required: ['foo', 'count'],
          });
        }
      });

      it('Then marks optional fields with optional: true and omits them from required[]', () => {
        const expr = buildTargetFile(
          `export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
const schema: SchemaLike<{ required: string; optional?: boolean }> = {} as SchemaLike<{ required: string; optional?: boolean }>;
export const target = schema;`,
        );
        const ref = resolveSchemaRefFromExpression(expr);
        if (ref.kind === 'inline') {
          expect(ref.resolvedFields).toEqual(
            expect.arrayContaining([
              { name: 'required', tsType: 'string', optional: false },
              { name: 'optional', tsType: 'boolean', optional: true },
            ]),
          );
          const required = (ref.jsonSchema as { required?: string[] }).required;
          expect(required).toEqual(['required']);
        }
      });

      it('Then maps Date fields to tsType "date"', () => {
        const expr = buildTargetFile(
          `export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
const schema: SchemaLike<{ createdAt: Date }> = {} as SchemaLike<{ createdAt: Date }>;
export const target = schema;`,
        );
        const ref = resolveSchemaRefFromExpression(expr);
        if (ref.kind === 'inline') {
          expect(ref.resolvedFields).toEqual([
            { name: 'createdAt', tsType: 'date', optional: false },
          ]);
          expect(ref.jsonSchema).toEqual({
            type: 'object',
            properties: { createdAt: { type: 'string', format: 'date-time' } },
            required: ['createdAt'],
          });
        }
      });
    });
  });

  describe('Given an expression whose type has no .parse method', () => {
    it('Then returns kind "inline" with resolvedFields undefined and jsonSchema {}', () => {
      const expr = buildTargetFile(`export const target = 42 as unknown as { noParse: true };`);
      const ref = resolveSchemaRefFromExpression(expr);
      expect(ref.kind).toBe('inline');
      if (ref.kind === 'inline') {
        expect(ref.resolvedFields).toBeUndefined();
        expect(ref.jsonSchema).toEqual({});
      }
    });
  });

  describe('Given an expression with sourceFile metadata', () => {
    it('Then sourceFile is set on the inline ref', () => {
      const expr = buildTargetFile(
        `export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
const schema: SchemaLike<{ ok: boolean }> = {} as SchemaLike<{ ok: boolean }>;
export const target = schema;`,
      );
      const ref = resolveSchemaRefFromExpression(expr);
      if (ref.kind === 'inline') {
        expect(ref.sourceFile).toContain('test.ts');
      }
    });
  });
});
