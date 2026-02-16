import type { Identifier, Node, Project, SourceFile } from 'ts-morph';
export interface ResolvedImport {
  declaration: Node;
  sourceFile: SourceFile;
  exportName: string;
}
export declare function resolveIdentifier(
  identifier: Identifier,
  project: Project,
): ResolvedImport | null;
export declare function resolveExport(
  file: SourceFile,
  exportName: string,
  project: Project,
): ResolvedImport | null;
export declare function isFromImport(identifier: Identifier, moduleSpecifier: string): boolean;
//# sourceMappingURL=import-resolver.d.ts.map
