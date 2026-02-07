import { describe, expect, it } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { SchemaIR, SchemaNameParts, SchemaRef } from '../../ir/types';
import {
  createInlineSchemaRef,
  createNamedSchemaRef,
  extractSchemaId,
  isSchemaExpression,
  isSchemaFile,
  parseSchemaName,
  SchemaAnalyzer,
  type SchemaAnalyzerResult,
} from '../schema-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

function getExpr(project: Project, source: string) {
  const file = project.createSourceFile('test.ts', source);
  const decl = file.getVariableDeclarationOrThrow('x');
  return { file, expr: decl.getInitializerOrThrow() };
}

describe('parseSchemaName', () => {
  it('parses createUserBody correctly', () => {
    const result = parseSchemaName('createUserBody');
    expect(result).toEqual({ operation: 'create', entity: 'User', part: 'Body' });
  });

  it('parses readUserResponse correctly', () => {
    expect(parseSchemaName('readUserResponse')).toEqual({ operation: 'read', entity: 'User', part: 'Response' });
  });

  it('parses updateTodoItemBody correctly', () => {
    expect(parseSchemaName('updateTodoItemBody')).toEqual({ operation: 'update', entity: 'TodoItem', part: 'Body' });
  });

  it('parses listTodoQuery correctly', () => {
    expect(parseSchemaName('listTodoQuery')).toEqual({ operation: 'list', entity: 'Todo', part: 'Query' });
  });

  it('parses deleteUserParams correctly', () => {
    expect(parseSchemaName('deleteUserParams')).toEqual({ operation: 'delete', entity: 'User', part: 'Params' });
  });

  it('parses readUserHeaders correctly', () => {
    expect(parseSchemaName('readUserHeaders')).toEqual({ operation: 'read', entity: 'User', part: 'Headers' });
  });

  it('returns all undefined for non-convention name', () => {
    expect(parseSchemaName('userSchema')).toEqual({});
  });

  it('returns all undefined for name with invalid operation', () => {
    expect(parseSchemaName('fetchUserBody')).toEqual({});
  });

  it('returns all undefined for name with invalid part', () => {
    expect(parseSchemaName('createUserInput')).toEqual({});
  });

  it('handles single-word entity', () => {
    expect(parseSchemaName('createUserBody').entity).toBe('User');
  });

  it('handles multi-word PascalCase entity', () => {
    expect(parseSchemaName('createTodoItemBody').entity).toBe('TodoItem');
  });

  it('parses createTodoItemCategoryBody as entity TodoItemCategory', () => {
    expect(parseSchemaName('createTodoItemCategoryBody').entity).toBe('TodoItemCategory');
  });
});

describe('isSchemaExpression', () => {
  it('detects s.object() as schema expression', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({ name: s.string() });`,
    );
    expect(isSchemaExpression(file, expr)).toBe(true);
  });

  it('detects s.string() as schema expression', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.string();`,
    );
    expect(isSchemaExpression(file, expr)).toBe(true);
  });

  it('detects s.email() as schema expression', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.email();`,
    );
    expect(isSchemaExpression(file, expr)).toBe(true);
  });

  it('detects s.string().min(1) chain as schema expression', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.string().min(1);`,
    );
    expect(isSchemaExpression(file, expr)).toBe(true);
  });

  it('detects s.object({}).id("name") as schema expression', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({}).id('name');`,
    );
    expect(isSchemaExpression(file, expr)).toBe(true);
  });

  it('does not detect unrelated function call', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `const x = console.log('hello');`,
    );
    expect(isSchemaExpression(file, expr)).toBe(false);
  });

  it('does not detect non-schema identifier', () => {
    const project = createProject();
    const { file, expr } = getExpr(
      project,
      `const someVariable = 1;\nconst x = someVariable;`,
    );
    expect(isSchemaExpression(file, expr)).toBe(false);
  });
});

describe('extractSchemaId', () => {
  it('extracts id from .id("CreateUser")', () => {
    const project = createProject();
    const { expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({ name: s.string() }).id('CreateUser');`,
    );
    expect(extractSchemaId(expr)).toBe('CreateUser');
  });

  it('returns null when no .id() call', () => {
    const project = createProject();
    const { expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({});`,
    );
    expect(extractSchemaId(expr)).toBeNull();
  });

  it('extracts id from chained expression', () => {
    const project = createProject();
    const { expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({}).describe('A user').id('User');`,
    );
    expect(extractSchemaId(expr)).toBe('User');
  });

  it('extracts id when .id() is followed by other methods', () => {
    const project = createProject();
    const { expr } = getExpr(
      project,
      `import { s } from '@vertz/schema';\nconst x = s.object({}).id('User').describe('A user');`,
    );
    expect(extractSchemaId(expr)).toBe('User');
  });
});

describe('createNamedSchemaRef', () => {
  it('creates named SchemaRef with correct fields', () => {
    const ref = createNamedSchemaRef('createUserBody', 'src/schemas/user.ts');
    expect(ref).toEqual({ kind: 'named', schemaName: 'createUserBody', sourceFile: 'src/schemas/user.ts' });
  });
});

describe('createInlineSchemaRef', () => {
  it('creates inline SchemaRef', () => {
    const ref = createInlineSchemaRef('src/schemas/user.ts');
    expect(ref).toEqual({ kind: 'inline', sourceFile: 'src/schemas/user.ts' });
  });
});

describe('isSchemaFile', () => {
  it('returns true for file importing @vertz/schema', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({});`,
    );
    expect(isSchemaFile(file)).toBe(true);
  });

  it('returns false for file not importing @vertz/schema', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'src/utils/helpers.ts',
      `export const foo = 'bar';`,
    );
    expect(isSchemaFile(file)).toBe(false);
  });
});

describe('SchemaAnalyzer', () => {
  it('discovers exported schema from file importing @vertz/schema', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({ name: s.string(), email: s.email() });`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(1);
    expect(result.schemas[0]!.name).toBe('createUserBody');
    expect(result.schemas[0]!.sourceFile).toContain('user.ts');
  });

  it('discovers multiple schemas from one file', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';
export const createUserBody = s.object({ name: s.string() });
export const createUserResponse = s.object({ id: s.string() });`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(2);
  });

  it('ignores non-exported schemas', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nconst localSchema = s.object({});`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(0);
  });

  it('ignores files that do not import @vertz/schema', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/utils/helpers.ts',
      `export const foo = 'bar';`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(0);
  });

  it('discovers schemas using schema import alias', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { schema } from '@vertz/schema';\nexport const createUserBody = schema.object({});`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(1);
  });

  it('discovers schemas with method chaining', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const name = s.string().min(1).max(100);`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas).toHaveLength(1);
  });

  it('discovers schemas with .id() call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({ name: s.string() }).id('CreateUser');`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas[0]!.id).toBe('CreateUser');
    expect(result.schemas[0]!.isNamed).toBe(true);
  });

  it('marks schemas without .id() as not named', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({ name: s.string() });`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas[0]!.isNamed).toBe(false);
    expect(result.schemas[0]!.id).toBeUndefined();
  });

  it('includes correct source location for discovered schema', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({});`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.schemas[0]!.sourceLine).toBe(2);
  });

  it('emits no diagnostics for valid schema file', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user.ts',
      `import { s } from '@vertz/schema';\nexport const createUserBody = s.object({});`,
    );
    const analyzer = new SchemaAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});

describe('type-level tests', () => {
  it('SchemaIR requires name field', () => {
    // @ts-expect-error — SchemaIR without 'name' should be rejected
    const bad: SchemaIR = {
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      namingConvention: {},
      isNamed: false,
    };
    expect(bad).toBeDefined();
  });

  it('SchemaNameParts fields are optional', () => {
    const parts: SchemaNameParts = {};
    expect(parts).toBeDefined();
  });

  it('SchemaRef (named) requires schemaName and sourceFile', () => {
    // @ts-expect-error — named SchemaRef without schemaName should be rejected
    const badRef: SchemaRef = { kind: 'named', sourceFile: 'test.ts' };
    expect(badRef).toBeDefined();
  });

  it('SchemaAnalyzerResult requires schemas array', () => {
    // @ts-expect-error — SchemaAnalyzerResult without schemas should be rejected
    const badResult: SchemaAnalyzerResult = {};
    expect(badResult).toBeDefined();
  });
});
