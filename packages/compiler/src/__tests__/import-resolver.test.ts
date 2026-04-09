import { describe, expect, it } from '@vertz/test';
import { Project, SyntaxKind } from 'ts-morph';
import { isFromImport, resolveExport, resolveIdentifier } from '../utils/import-resolver';

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

describe('resolveIdentifier', () => {
  it('resolves a named import to its source declaration', () => {
    const project = createProject({
      'src/utils.ts': 'export const helper = 42;',
      'src/app.ts': `
        import { helper } from './utils';
        const x = helper;
      `,
    });
    const appFile = project.getSourceFileOrThrow('src/app.ts');
    const decl = appFile.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);

    const result = resolveIdentifier(identifier, project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('helper');
    expect(result?.sourceFile.getFilePath()).toContain('utils.ts');
  });

  it('returns null for local variable (no import)', () => {
    const project = createProject({
      'src/app.ts': `
        const helper = 42;
        const x = helper;
      `,
    });
    const appFile = project.getSourceFileOrThrow('src/app.ts');
    const decl = appFile.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);

    const result = resolveIdentifier(identifier, project);
    expect(result).toBeNull();
  });
});

describe('resolveExport', () => {
  it('resolves through re-export declarations', () => {
    const project = createProject({
      'src/base.ts': 'export const value = 42;',
      'src/index.ts': `export { value } from './base';`,
      'src/app.ts': `
        import { value } from './index';
        const x = value;
      `,
    });
    const indexFile = project.getSourceFileOrThrow('src/index.ts');
    const result = resolveExport(indexFile, 'value', project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('value');
    expect(result?.sourceFile.getFilePath()).toContain('base.ts');
  });

  it('resolves aliased re-exports', () => {
    const project = createProject({
      'src/base.ts': 'export const original = 42;',
      'src/index.ts': `export { original as aliased } from './base';`,
    });
    const indexFile = project.getSourceFileOrThrow('src/index.ts');
    const result = resolveExport(indexFile, 'aliased', project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('original');
    expect(result?.sourceFile.getFilePath()).toContain('base.ts');
  });

  it('returns null when export name is not found', () => {
    const project = createProject({
      'src/base.ts': 'export const value = 42;',
    });
    const file = project.getSourceFileOrThrow('src/base.ts');
    const result = resolveExport(file, 'nonexistent', project);
    expect(result).toBeNull();
  });

  it('returns direct declaration when no re-export matches', () => {
    const project = createProject({
      'src/base.ts': 'export const value = 42;',
    });
    const file = project.getSourceFileOrThrow('src/base.ts');
    const result = resolveExport(file, 'value', project);
    expect(result).not.toBeNull();
    expect(result?.exportName).toBe('value');
  });
});

describe('isFromImport', () => {
  it('returns true for matching import', () => {
    const project = createProject({
      'src/app.ts': `
        import { createDb } from '@vertz/db';
        const x = createDb;
      `,
    });
    const file = project.getSourceFileOrThrow('src/app.ts');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);
    expect(isFromImport(identifier, '@vertz/db')).toBe(true);
  });

  it('returns false for non-matching import', () => {
    const project = createProject({
      'src/app.ts': `
        import { createDb } from '@vertz/db';
        const x = createDb;
      `,
    });
    const file = project.getSourceFileOrThrow('src/app.ts');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);
    expect(isFromImport(identifier, '@vertz/server')).toBe(false);
  });

  it('matches vertz/ meta-package equivalent', () => {
    const project = createProject({
      'src/app.ts': `
        import { createDb } from 'vertz/db';
        const x = createDb;
      `,
    });
    const file = project.getSourceFileOrThrow('src/app.ts');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);
    expect(isFromImport(identifier, '@vertz/db')).toBe(true);
  });

  it('returns false for local variable with no import', () => {
    const project = createProject({
      'src/app.ts': `
        const createDb = () => {};
        const x = createDb;
      `,
    });
    const file = project.getSourceFileOrThrow('src/app.ts');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);
    expect(isFromImport(identifier, '@vertz/db')).toBe(false);
  });

  it('matches namespace imports', () => {
    const project = createProject({
      'src/app.ts': `
        import * as db from '@vertz/db';
        const x = db;
      `,
    });
    const file = project.getSourceFileOrThrow('src/app.ts');
    const decl = file.getVariableDeclarationOrThrow('x');
    const init = decl.getInitializerOrThrow();
    const identifier = init.asKindOrThrow(SyntaxKind.Identifier);
    expect(isFromImport(identifier, '@vertz/db')).toBe(true);
  });
});
