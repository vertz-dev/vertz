import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import {
  extractSchemaId,
  isSchemaExpression,
  parseSchemaName,
  SchemaAnalyzer,
} from '../analyzers/schema-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('SchemaAnalyzer', () => {
  it('detects schemas with .id() call', async () => {
    const project = createProject({
      'src/schemas.ts': `
        import { s } from '@vertz/schema';
        export const createUserBody = s.object({ name: s.string() }).id('CreateUser');
      `,
    });
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas.length).toBe(1);
    expect(result.schemas[0]?.name).toBe('createUserBody');
    expect(result.schemas[0]?.id).toBe('CreateUser');
    expect(result.schemas[0]?.isNamed).toBe(true);
  });

  it('detects schemas without .id() — unnamed schemas', async () => {
    const project = createProject({
      'src/schemas.ts': `
        import { s } from '@vertz/schema';
        export const mySchema = s.object({ name: s.string() });
      `,
    });
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas.length).toBe(1);
    expect(result.schemas[0]?.id).toBeUndefined();
    expect(result.schemas[0]?.isNamed).toBe(false);
  });

  it('skips files without @vertz/schema import', async () => {
    const project = createProject({
      'src/utils.ts': `
        export const helper = { name: 'test' };
      `,
    });
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toEqual([]);
  });
});

describe('parseSchemaName', () => {
  it('parses standard naming convention', () => {
    expect(parseSchemaName('createUserBody')).toEqual({
      operation: 'create',
      entity: 'User',
      part: 'Body',
    });
  });

  it('returns empty object for non-matching names', () => {
    expect(parseSchemaName('mySchema')).toEqual({});
  });

  it('returns empty for operation with no remaining part', () => {
    expect(parseSchemaName('create')).toEqual({});
  });

  it('returns empty for entity starting with lowercase', () => {
    expect(parseSchemaName('createuserBody')).toEqual({});
  });

  it('returns empty for operation-only without entity and part', () => {
    expect(parseSchemaName('createBody')).toEqual({});
  });

  it('parses different operations and parts', () => {
    expect(parseSchemaName('readUserResponse')).toEqual({
      operation: 'read',
      entity: 'User',
      part: 'Response',
    });
    expect(parseSchemaName('listOrderQuery')).toEqual({
      operation: 'list',
      entity: 'Order',
      part: 'Query',
    });
    expect(parseSchemaName('deleteUserParams')).toEqual({
      operation: 'delete',
      entity: 'User',
      part: 'Params',
    });
    expect(parseSchemaName('updateUserHeaders')).toEqual({
      operation: 'update',
      entity: 'User',
      part: 'Headers',
    });
  });
});

describe('extractSchemaId', () => {
  it('extracts .id() from a chained schema call', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `
        const s = { object: (x: any) => ({ id: (v: string) => v, describe: (d: string) => ({}) }) };
        const schema = s.object({ name: 'test' }).id('MySchema');
      `,
    );
    const decl = file.getVariableDeclarationOrThrow('schema');
    const init = decl.getInitializerOrThrow();
    expect(extractSchemaId(init)).toBe('MySchema');
  });

  it('returns null when no .id() call exists', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `
        const s = { object: (x: any) => ({ describe: (d: string) => ({}) }) };
        const schema = s.object({ name: 'test' }).describe('A schema');
      `,
    );
    const decl = file.getVariableDeclarationOrThrow('schema');
    const init = decl.getInitializerOrThrow();
    expect(extractSchemaId(init)).toBeNull();
  });

  it('returns null for non-call expression', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile('test.ts', 'const schema = "not a call";');
    const decl = file.getVariableDeclarationOrThrow('schema');
    const init = decl.getInitializerOrThrow();
    expect(extractSchemaId(init)).toBeNull();
  });

  it('returns null when .id() argument is not a string literal', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `
        const s = { object: (x: any) => ({ id: (v: any) => v }) };
        const name = 'MySchema';
        const schema = s.object({}).id(name);
      `,
    );
    const decl = file.getVariableDeclarationOrThrow('schema');
    const init = decl.getInitializerOrThrow();
    // .id(name) where name is an Identifier, not a StringLiteral
    expect(extractSchemaId(init)).toBeNull();
  });
});

describe('isSchemaExpression', () => {
  it('returns false for non-schema expressions', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile('test.ts', 'const x = 42;');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    expect(isSchemaExpression(file, init)).toBe(false);
  });

  it('returns false for expressions with no root identifier', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile('test.ts', 'const x = { a: 1 };');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    // ObjectLiteralExpression has no root identifier
    expect(isSchemaExpression(file, init)).toBe(false);
  });
});
