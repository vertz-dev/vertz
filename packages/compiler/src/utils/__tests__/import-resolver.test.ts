import { Project, SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'bun:test';
import { isFromImport, resolveExport, resolveIdentifier } from '../import-resolver';

const _sharedProject = new Project({ useInMemoryFileSystem: true });

function createProject() {
  for (const file of _sharedProject.getSourceFiles()) {
    file.deleteImmediatelySync();
  }
  return _sharedProject;
}

function getIdentifierUsage(file: ReturnType<Project['createSourceFile']>, varName: string) {
  const decl = file.getVariableDeclarationOrThrow(varName);
  return decl.getInitializerOrThrow().asKindOrThrow(SyntaxKind.Identifier);
}

describe('resolveIdentifier', () => {
  it('resolves named import to original declaration', () => {
    const project = createProject();
    project.createSourceFile('user.ts', `export const userService = {};`);
    const routerFile = project.createSourceFile(
      'router.ts',
      `import { userService } from './user';\nconst x = userService;`,
    );
    const id = getIdentifierUsage(routerFile, 'x');
    const result = resolveIdentifier(id, project);
    expect(result).not.toBeNull();
    expect(result?.sourceFile.getFilePath()).toContain('user.ts');
    expect(result?.exportName).toBe('userService');
  });

  it('resolves renamed import', () => {
    const project = createProject();
    project.createSourceFile('user.ts', `export const userService = {};`);
    const routerFile = project.createSourceFile(
      'router.ts',
      `import { userService as us } from './user';\nconst x = us;`,
    );
    const id = getIdentifierUsage(routerFile, 'x');
    const result = resolveIdentifier(id, project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('userService');
    expect(result?.sourceFile.getFilePath()).toContain('user.ts');
  });

  it('resolves re-export chain', () => {
    const project = createProject();
    project.createSourceFile('user.ts', `export const userService = {};`);
    project.createSourceFile('index.ts', `export { userService } from './user';`);
    const routerFile = project.createSourceFile(
      'router.ts',
      `import { userService } from './index';\nconst x = userService;`,
    );
    const id = getIdentifierUsage(routerFile, 'x');
    const result = resolveIdentifier(id, project);
    expect(result).not.toBeNull();
    expect(result?.sourceFile.getFilePath()).toContain('user.ts');
    expect(result?.exportName).toBe('userService');
  });

  it('returns null for local variable (not imported)', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const local = 1;\nconst x = local;`);
    const id = getIdentifierUsage(file, 'x');
    const result = resolveIdentifier(id, project);
    expect(result).toBeNull();
  });

  it('returns null for unresolvable import', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `import { foo } from 'nonexistent-package';\nconst x = foo;`,
    );
    const id = getIdentifierUsage(file, 'x');
    const result = resolveIdentifier(id, project);
    expect(result).toBeNull();
  });
});

describe('resolveExport', () => {
  it('finds direct export declaration', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `export const foo = 1;`);
    const result = resolveExport(file, 'foo', project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('foo');
  });

  it('follows re-export to source', () => {
    const project = createProject();
    project.createSourceFile('b.ts', `export const bar = 2;`);
    const fileA = project.createSourceFile('a.ts', `export { bar } from './b';`);
    const result = resolveExport(fileA, 'bar', project);
    expect(result).not.toBeNull();
    expect(result?.sourceFile.getFilePath()).toContain('b.ts');
    expect(result?.exportName).toBe('bar');
  });
});

describe('isFromImport', () => {
  it('returns true when identifier is imported from matching module', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `import { s } from '@vertz/schema';\nconst x = s;`,
    );
    const id = getIdentifierUsage(file, 'x');
    expect(isFromImport(id, '@vertz/schema')).toBe(true);
  });

  it('returns false when identifier is from different module', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `import { s } from '@vertz/schema';\nconst x = s;`,
    );
    const id = getIdentifierUsage(file, 'x');
    expect(isFromImport(id, '@vertz/core')).toBe(false);
  });

  it('returns false for local variable', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const s = 1;\nconst x = s;`);
    const id = getIdentifierUsage(file, 'x');
    expect(isFromImport(id, '@vertz/schema')).toBe(false);
  });
});
