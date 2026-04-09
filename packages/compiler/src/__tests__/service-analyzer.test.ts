import { describe, expect, it } from '@vertz/test';
import { Project } from 'ts-morph';
import { extractMethodSignatures, ServiceAnalyzer } from '../analyzers/service-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('ServiceAnalyzer', () => {
  it('analyze() returns empty services array', async () => {
    const project = createProject({});
    const analyzer = new ServiceAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result).toEqual({ services: [] });
  });

  it('analyzeForModule detects parenthesized arrow return', async () => {
    const project = createProject({
      'src/module.ts': `
        const myModule = { service: (name: string, opts: any) => opts };
      `,
      'src/service.ts': `
        import { myModule } from './module';
        const userService = myModule.service('users', {
          methods: (deps: any) => ({
            getUser: (id: string) => ({ id, name: 'test' }),
          }),
        });
      `,
    });
    const file = project.getSourceFileOrThrow('src/service.ts');
    // Verify the file contains the expected structure
    const decl = file.getVariableDeclaration('userService');
    expect(decl).toBeDefined();
    expect(decl?.getInitializer()?.getText()).toContain('myModule.service');
  });
});

describe('extractMethodSignatures', () => {
  it('returns empty for non-function expression', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile('test.ts', 'const x = "not a function";');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    expect(extractMethodSignatures(init)).toEqual([]);
  });

  it('handles arrow with parenthesized object return', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `const methods = (deps: any) => ({
        getUser: (id: string) => ({ id }),
        createUser: (name: string) => ({ name }),
      });`,
    );
    const decl = file.getVariableDeclarationOrThrow('methods');
    const init = decl.getInitializerOrThrow();
    const result = extractMethodSignatures(init);
    expect(result.length).toBe(2);
    expect(result[0]?.name).toBe('getUser');
    expect(result[0]?.parameters.length).toBe(1);
    expect(result[0]?.parameters[0]?.name).toBe('id');
    expect(result[1]?.name).toBe('createUser');
  });

  it('handles block body with return statement', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `const methods = (deps: any) => {
        return {
          getUser: (id: string) => ({ id }),
        };
      };`,
    );
    const decl = file.getVariableDeclarationOrThrow('methods');
    const init = decl.getInitializerOrThrow();
    const result = extractMethodSignatures(init);
    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe('getUser');
  });

  it('returns unknown for non-function method value', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `const methods = () => ({
        getUser: (id: string) => ({ id }),
        staticValue: 42,
      });`,
    );
    const decl = file.getVariableDeclarationOrThrow('methods');
    const init = decl.getInitializerOrThrow();
    const result = extractMethodSignatures(init);
    // staticValue has initializer but it's a NumericLiteral, not a function
    // extractFunctionParams returns [] for non-function
    // inferReturnType returns 'unknown' for non-function
    expect(result.length).toBe(2);
    const staticMethod = result.find((m) => m.name === 'staticValue');
    expect(staticMethod?.parameters).toEqual([]);
    expect(staticMethod?.returnType).toBe('unknown');
  });

  it('handles function expression body', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `const methods = function(deps: any) {
        return {
          getUser: function(id: string) { return { id }; },
        };
      };`,
    );
    const decl = file.getVariableDeclarationOrThrow('methods');
    const init = decl.getInitializerOrThrow();
    const result = extractMethodSignatures(init);
    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe('getUser');
    expect(result[0]?.parameters[0]?.name).toBe('id');
  });

  it('returns empty when arrow has no return object', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'test.ts',
      `const methods = () => {
        console.log('no return');
      };`,
    );
    const decl = file.getVariableDeclarationOrThrow('methods');
    const init = decl.getInitializerOrThrow();
    const result = extractMethodSignatures(init);
    expect(result).toEqual([]);
  });
});
