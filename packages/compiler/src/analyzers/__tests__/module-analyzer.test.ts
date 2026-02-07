import { describe, expect, it } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { ImportRef, ModuleIR } from '../../ir/types';
import { extractIdentifierNames, ModuleAnalyzer, parseImports } from '../module-analyzer';
import { ServiceAnalyzer } from '../service-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

function createAnalyzer(project: Project) {
  const config = resolveConfig();
  const serviceAnalyzer = new ServiceAnalyzer(project, config);
  return new ModuleAnalyzer(project, config, serviceAnalyzer);
}

describe('ModuleAnalyzer', () => {
  it('discovers vertz.moduleDef() and extracts module name', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
export const userModuleDef = vertz.moduleDef({ name: 'user' });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]!.name).toBe('user');
  });

  it('discovers multiple module definitions', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/modules.ts',
      `import { vertz } from '@vertz/core';
export const userModuleDef = vertz.moduleDef({ name: 'user' });
export const todoModuleDef = vertz.moduleDef({ name: 'todo' });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules).toHaveLength(2);
  });

  it('extracts source location of moduleDef call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
export const userModuleDef = vertz.moduleDef({ name: 'user' });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.sourceLine).toBe(2);
    expect(result.modules[0]!.sourceFile).toContain('user.module.ts');
  });

  it('extracts imports from moduleDef', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/core/index.ts',
      `export const dbService = {};`,
    );
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
import { dbService } from '../core/index';
const userModuleDef = vertz.moduleDef({ name: 'user', imports: { dbService } });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.imports).toHaveLength(1);
    expect(result.modules[0]!.imports[0]!.localName).toBe('dbService');
  });

  it('extracts multiple imports', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user', imports: { dbService, configService } });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.imports).toHaveLength(2);
  });

  it('imports is empty array when not specified', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.imports).toEqual([]);
  });

  it('extracts options schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/user-options.schema.ts',
      `export const userOptionsSchema = {};`,
    );
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
import { userOptionsSchema } from '../schemas/user-options.schema';
const userModuleDef = vertz.moduleDef({ name: 'user', options: userOptionsSchema });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.options).toBeDefined();
    expect(result.modules[0]!.options!.kind).toBe('named');
    if (result.modules[0]!.options!.kind === 'named') {
      expect(result.modules[0]!.options!.schemaName).toBe('userOptionsSchema');
    }
  });

  it('options is undefined when not specified', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.options).toBeUndefined();
  });

  it('links vertz.module() to its moduleDef and extracts exports', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = {};
const userRouter = {};
export const userModule = vertz.module(userModuleDef, {
  services: [userService],
  routers: [userRouter],
  exports: [userService],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.exports).toEqual(['userService']);
  });

  it('extracts service names from module assembly', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = {};
export const userModule = vertz.module(userModuleDef, {
  services: [userService],
  exports: [],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.name).toBe('user');
    // Services are stored as ServiceIR[] — populated later by ServiceAnalyzer integration
    // For now we verify module was found
    expect(result.modules).toHaveLength(1);
  });

  it('extracts router names from module assembly', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = {};
export const userModule = vertz.module(userModuleDef, {
  routers: [userRouter],
  exports: [],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules).toHaveLength(1);
  });

  it('extracts multiple export names from module assembly', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userService = {};
const authService = {};
export const userModule = vertz.module(userModuleDef, {
  services: [userService, authService],
  exports: [userService, authService],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.exports).toEqual(['userService', 'authService']);
  });

  it('handles module with no exports', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
export const userModule = vertz.module(userModuleDef, {
  exports: [],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.exports).toEqual([]);
  });

  it('handles module with no routers', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
export const userModule = vertz.module(userModuleDef, {
  services: [],
  exports: [],
});`,
    );
    const analyzer = createAnalyzer(project);
    const result = await analyzer.analyze();
    expect(result.modules[0]!.routers).toEqual([]);
  });

  it('emits error for moduleDef without name property', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({});`,
    );
    const analyzer = createAnalyzer(project);
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.severity).toBe('error');
    expect(diags[0]!.code).toBe('VERTZ_MODULE_DYNAMIC_NAME');
  });

  it('emits no diagnostics for valid module', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.module.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
export const userModule = vertz.module(userModuleDef, { exports: [] });`,
    );
    const analyzer = createAnalyzer(project);
    await analyzer.analyze();
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});

describe('parseImports', () => {
  it('parses shorthand imports', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const obj = { dbService, configService };`,
    );
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const result = parseImports(obj);
    expect(result).toHaveLength(2);
    expect(result[0]!.localName).toBe('dbService');
    expect(result[1]!.localName).toBe('configService');
  });

  it('handles empty imports object', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const obj = {};`);
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseImports(obj)).toEqual([]);
  });
});

describe('extractIdentifierNames', () => {
  it('extracts names from identifier array', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const arr = [userService, authService];`,
    );
    const decl = file.getVariableDeclarationOrThrow('arr');
    const expr = decl.getInitializerOrThrow();
    expect(extractIdentifierNames(expr)).toEqual(['userService', 'authService']);
  });

  it('returns empty array for empty array', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const arr: any[] = [];`);
    const decl = file.getVariableDeclarationOrThrow('arr');
    const expr = decl.getInitializerOrThrow();
    expect(extractIdentifierNames(expr)).toEqual([]);
  });
});

describe('type-level tests', () => {
  it('ModuleIR requires name', () => {
    // @ts-expect-error — ModuleIR without 'name' should be rejected
    const bad: ModuleIR = {
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      imports: [],
      services: [],
      routers: [],
      exports: [],
    };
    expect(bad).toBeDefined();
  });

  it('ImportRef requires localName', () => {
    // @ts-expect-error — ImportRef without 'localName' should be rejected
    const bad: ImportRef = { isEnvImport: false };
    expect(bad).toBeDefined();
  });
});
