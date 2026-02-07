import { describe, expect, it } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { InjectRef, ServiceIR, ServiceMethodIR, ServiceMethodParam } from '../../ir/types';
import { extractMethodSignatures, parseInjectRefs, ServiceAnalyzer } from '../service-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

describe('ServiceAnalyzer', () => {
  it('discovers moduleDef.service() call and extracts service name', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  inject: {},
  methods: () => ({
    findById: async (id: string) => ({ id, name: 'Test' }),
  }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('userService');
    expect(result[0]!.moduleName).toBe('user');
  });

  it('discovers multiple services on same moduleDef', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({ findById: async (id: string) => id }),
});
const authService = userModuleDef.service({
  methods: () => ({ verify: async (token: string) => true }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result).toHaveLength(2);
  });

  it('extracts source location of service definition', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.sourceLine).toBe(3);
    expect(result[0]!.sourceFile).toContain('user.service.ts');
  });

  it('extracts inject references with shorthand', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  inject: { dbService, configService },
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.inject).toHaveLength(2);
    expect(result[0]!.inject[0]).toEqual({ localName: 'dbService', resolvedToken: 'dbService' });
    expect(result[0]!.inject[1]).toEqual({ localName: 'configService', resolvedToken: 'configService' });
  });

  it('extracts inject with explicit key', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const dbService = {};
const userService = userModuleDef.service({
  inject: { db: dbService },
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.inject[0]).toEqual({ localName: 'db', resolvedToken: 'dbService' });
  });

  it('empty inject when not specified', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.inject).toEqual([]);
  });

  it('empty inject for empty object', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  inject: {},
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.inject).toEqual([]);
  });

  it('extracts method names from arrow function return', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: (deps: any) => ({
    findById: async (id: string) => deps,
    create: async (data: any) => deps,
  }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods).toHaveLength(2);
    expect(result[0]!.methods[0]!.name).toBe('findById');
    expect(result[0]!.methods[1]!.name).toBe('create');
  });

  it('extracts method parameter names and types', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({
    findById: async (id: string) => ({ id }),
  }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods[0]!.parameters).toHaveLength(1);
    expect(result[0]!.methods[0]!.parameters[0]!.name).toBe('id');
    expect(result[0]!.methods[0]!.parameters[0]!.type).toBe('string');
  });

  it('extracts method with multiple parameters', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
type UpdateData = { name: string };
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({
    update: async (id: string, data: UpdateData) => ({ id }),
  }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods[0]!.parameters).toHaveLength(2);
  });

  it('extracts method return type', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({
    findById: async (id: string): Promise<string> => id,
  }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods[0]!.returnType).toContain('Promise');
  });

  it('handles methods factory with block body', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: (deps: any) => {
    return {
      findById: async (id: string) => deps,
    };
  },
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods).toHaveLength(1);
    expect(result[0]!.methods[0]!.name).toBe('findById');
  });

  it('returns empty methods for methods without recognizable return', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: 'not a function',
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(result[0]!.methods).toEqual([]);
  });

  it('emits no diagnostics for valid service', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.service.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = userModuleDef.service({
  methods: () => ({ findById: async (id: string) => id }),
});`,
    );
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModule('userModuleDef', 'user');
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});

describe('parseInjectRefs', () => {
  it('parses shorthand inject properties', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const dbService = {}; const obj = { dbService };`,
    );
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([{ localName: 'dbService', resolvedToken: 'dbService' }]);
  });

  it('parses explicit inject properties', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const dbService = {}; const obj = { db: dbService };`,
    );
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([{ localName: 'db', resolvedToken: 'dbService' }]);
  });

  it('returns empty array for empty object', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const obj = {};`);
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([]);
  });
});

describe('extractMethodSignatures', () => {
  it('extracts from arrow function with implicit object return', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const x = () => ({ findById: async (id: string) => id });`,
    );
    const decl = file.getVariableDeclarationOrThrow('x');
    const expr = decl.getInitializerOrThrow();
    const methods = extractMethodSignatures(expr);
    expect(methods).toHaveLength(1);
    expect(methods[0]!.name).toBe('findById');
  });

  it('extracts from arrow function with block body and return statement', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const x = () => { return { findById: async (id: string) => id }; };`,
    );
    const decl = file.getVariableDeclarationOrThrow('x');
    const expr = decl.getInitializerOrThrow();
    const methods = extractMethodSignatures(expr);
    expect(methods).toHaveLength(1);
    expect(methods[0]!.name).toBe('findById');
  });

  it('returns empty array when expression is not a function', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const x = 'not a function';`);
    const decl = file.getVariableDeclarationOrThrow('x');
    const expr = decl.getInitializerOrThrow();
    expect(extractMethodSignatures(expr)).toEqual([]);
  });
});

describe('type-level tests', () => {
  it('ServiceIR requires name and moduleName', () => {
    // @ts-expect-error — ServiceIR without 'moduleName' should be rejected
    const bad: ServiceIR = {
      name: 'userService',
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      inject: [],
      methods: [],
    };
    expect(bad).toBeDefined();
  });

  it('InjectRef requires both localName and resolvedToken', () => {
    // @ts-expect-error — InjectRef without 'resolvedToken' should be rejected
    const bad: InjectRef = { localName: 'db' };
    expect(bad).toBeDefined();
  });

  it('ServiceMethodIR requires name, parameters, and returnType', () => {
    // @ts-expect-error — ServiceMethodIR without 'returnType' should be rejected
    const bad: ServiceMethodIR = { name: 'findById', parameters: [] };
    expect(bad).toBeDefined();
  });

  it('ServiceMethodParam requires name and type', () => {
    // @ts-expect-error — ServiceMethodParam without 'type' should be rejected
    const bad: ServiceMethodParam = { name: 'id' };
    expect(bad).toBeDefined();
  });
});
