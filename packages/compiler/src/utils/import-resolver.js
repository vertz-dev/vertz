export function resolveIdentifier(identifier, project) {
  const importInfo = findImportForIdentifier(identifier);
  if (!importInfo) return null;
  const moduleSourceFile = importInfo.importDecl.getModuleSpecifierSourceFile();
  if (!moduleSourceFile) return null;
  return resolveExport(moduleSourceFile, importInfo.originalName, project);
}
export function resolveExport(file, exportName, project) {
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
export function isFromImport(identifier, moduleSpecifier) {
  const importInfo = findImportForIdentifier(identifier);
  if (!importInfo) return false;
  return importInfo.importDecl.getModuleSpecifierValue() === moduleSpecifier;
}
function findImportForIdentifier(identifier) {
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
//# sourceMappingURL=import-resolver.js.map
