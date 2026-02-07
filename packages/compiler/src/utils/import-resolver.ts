import type { Identifier, ImportDeclaration, Node, Project, SourceFile } from 'ts-morph';

export interface ResolvedImport {
  declaration: Node;
  sourceFile: SourceFile;
  exportName: string;
}

export function resolveIdentifier(identifier: Identifier, project: Project): ResolvedImport | null {
  const importInfo = findImportForIdentifier(identifier);
  if (!importInfo) return null;

  const moduleSourceFile = importInfo.importDecl.getModuleSpecifierSourceFile();
  if (!moduleSourceFile) return null;

  return resolveExport(moduleSourceFile, importInfo.originalName, project);
}

export function resolveExport(
  file: SourceFile,
  exportName: string,
  project: Project,
): ResolvedImport | null {
  for (const exportDecl of file.getExportDeclarations()) {
    const moduleSourceFile = exportDecl.getModuleSpecifierSourceFile();
    if (!moduleSourceFile) continue;

    for (const named of exportDecl.getNamedExports()) {
      const name = named.getAliasNode()?.getText() ?? named.getName();
      if (name === exportName) {
        return resolveExport(moduleSourceFile, named.getName(), project);
      }
    }
  }

  const exportedDecls = file.getExportedDeclarations().get(exportName);
  if (exportedDecls && exportedDecls.length > 0) {
    const decl = exportedDecls.at(0);
    if (!decl) return null;
    return {
      declaration: decl,
      sourceFile: decl.getSourceFile(),
      exportName,
    };
  }

  return null;
}

export function isFromImport(identifier: Identifier, moduleSpecifier: string): boolean {
  const importInfo = findImportForIdentifier(identifier);
  if (!importInfo) return false;
  return importInfo.importDecl.getModuleSpecifierValue() === moduleSpecifier;
}

// ── Internal helpers ────────────────────────────────────────────────

interface ImportMatch {
  importDecl: ImportDeclaration;
  originalName: string;
}

function findImportForIdentifier(identifier: Identifier): ImportMatch | null {
  const sourceFile = identifier.getSourceFile();
  const name = identifier.getText();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    for (const specifier of importDecl.getNamedImports()) {
      const localName = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (localName === name) {
        return { importDecl, originalName: specifier.getName() };
      }
    }

    const nsImport = importDecl.getNamespaceImport();
    if (nsImport && nsImport.getText() === name) {
      return { importDecl, originalName: '*' };
    }
  }

  return null;
}
