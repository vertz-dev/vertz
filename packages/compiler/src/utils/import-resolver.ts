import type { Identifier, Node, Project, SourceFile } from 'ts-morph';

export interface ResolvedImport {
  declaration: Node;
  sourceFile: SourceFile;
  exportName: string;
}

export function resolveIdentifier(
  identifier: Identifier,
  project: Project,
): ResolvedImport | null {
  // Check if this identifier is locally declared (not from an import)
  const importDecl = findImportForIdentifier(identifier);
  if (!importDecl) return null;

  const { moduleSourceFile, originalName } = importDecl;
  if (!moduleSourceFile) return null;

  return resolveExport(moduleSourceFile, originalName, project);
}

function findImportForIdentifier(
  identifier: Identifier,
): { moduleSourceFile: SourceFile | undefined; originalName: string } | null {
  const sourceFile = identifier.getSourceFile();
  const name = identifier.getText();

  // Search through import declarations in this file
  for (const importDecl of sourceFile.getImportDeclarations()) {
    // Check named imports
    for (const specifier of importDecl.getNamedImports()) {
      const localName = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (localName === name) {
        return {
          moduleSourceFile: importDecl.getModuleSpecifierSourceFile(),
          originalName: specifier.getName(),
        };
      }
    }

    // Check namespace imports
    const nsImport = importDecl.getNamespaceImport();
    if (nsImport && nsImport.getText() === name) {
      return {
        moduleSourceFile: importDecl.getModuleSpecifierSourceFile(),
        originalName: '*',
      };
    }
  }

  return null;
}

export function resolveExport(
  file: SourceFile,
  exportName: string,
  project: Project,
): ResolvedImport | null {
  // Check for re-exports: export { foo } from './other'
  for (const exportDecl of file.getExportDeclarations()) {
    const moduleSpecifier = exportDecl.getModuleSpecifierSourceFile();
    for (const named of exportDecl.getNamedExports()) {
      const name = named.getAliasNode()?.getText() ?? named.getName();
      if (name === exportName) {
        if (moduleSpecifier) {
          const originalName = named.getName();
          return resolveExport(moduleSpecifier, originalName, project);
        }
      }
    }
  }

  // Check for direct exports
  const exportedDecls = file.getExportedDeclarations().get(exportName);
  if (exportedDecls && exportedDecls.length > 0) {
    const decl = exportedDecls[0]!;
    return {
      declaration: decl,
      sourceFile: decl.getSourceFile(),
      exportName,
    };
  }

  return null;
}

export function isFromImport(
  identifier: Identifier,
  moduleSpecifier: string,
): boolean {
  const sourceFile = identifier.getSourceFile();
  const name = identifier.getText();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    if (importDecl.getModuleSpecifierValue() !== moduleSpecifier) continue;

    for (const specifier of importDecl.getNamedImports()) {
      const localName = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (localName === name) return true;
    }

    const nsImport = importDecl.getNamespaceImport();
    if (nsImport && nsImport.getText() === name) return true;
  }

  return false;
}
