import type { Expression, Identifier, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { InlineSchemaRef, NamedSchemaRef, SchemaIR, SchemaNameParts } from '../ir/types';
import { getSourceLocation, getStringValue } from '../utils/ast-helpers';
import { isFromImport } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

export interface SchemaAnalyzerResult {
  schemas: SchemaIR[];
}

export class SchemaAnalyzer extends BaseAnalyzer<SchemaAnalyzerResult> {
  async analyze(): Promise<SchemaAnalyzerResult> {
    const schemas: SchemaIR[] = [];
    for (const file of this.project.getSourceFiles()) {
      if (!isSchemaFile(file)) continue;
      for (const exportSymbol of file.getExportSymbols()) {
        const declarations = exportSymbol.getDeclarations();
        for (const decl of declarations) {
          if (!decl.isKind(SyntaxKind.VariableDeclaration)) continue;
          const initializer = decl.getInitializer();
          if (!initializer) continue;
          if (!isSchemaExpression(file, initializer)) continue;

          const name = exportSymbol.getName();
          const loc = getSourceLocation(decl);
          const id = extractSchemaId(initializer);
          schemas.push({
            name,
            ...loc,
            id: id ?? undefined,
            namingConvention: parseSchemaName(name),
            isNamed: id !== null,
          });
        }
      }
    }
    return { schemas };
  }
}

const VALID_OPERATIONS = ['create', 'read', 'update', 'list', 'delete'] as const;
const VALID_PARTS = ['Body', 'Response', 'Query', 'Params', 'Headers'] as const;

export function parseSchemaName(name: string): SchemaNameParts {
  for (const op of VALID_OPERATIONS) {
    if (!name.startsWith(op)) continue;
    const rest = name.slice(op.length);
    if (rest.length === 0) continue;

    for (const part of VALID_PARTS) {
      if (!rest.endsWith(part)) continue;
      const entity = rest.slice(0, -part.length);
      if (entity.length === 0) continue;
      // Entity must start with uppercase
      if (entity[0] !== entity[0]!.toUpperCase()) continue;
      return { operation: op, entity, part };
    }
  }
  return {};
}

export function isSchemaExpression(_file: SourceFile, expr: Expression): boolean {
  const root = findRootIdentifier(expr);
  if (!root) return false;
  return isFromImport(root, '@vertz/schema');
}

export function extractSchemaId(expr: Expression): string | null {
  // Look for .id('SomeString') at the end of a call chain
  if (!expr.isKind(SyntaxKind.CallExpression)) return null;
  const callExpr = expr.getExpression();
  if (!callExpr.isKind(SyntaxKind.PropertyAccessExpression)) return null;
  if (callExpr.getName() !== 'id') return null;
  const args = expr.getArguments();
  if (args.length !== 1) return null;
  return getStringValue(args[0]! as Expression);
}

export function isSchemaFile(file: SourceFile): boolean {
  return file.getImportDeclarations().some(
    (decl) => decl.getModuleSpecifierValue() === '@vertz/schema',
  );
}

export function createNamedSchemaRef(schemaName: string, sourceFile: string): NamedSchemaRef {
  return { kind: 'named', schemaName, sourceFile };
}

export function createInlineSchemaRef(sourceFile: string): InlineSchemaRef {
  return { kind: 'inline', sourceFile };
}

function findRootIdentifier(expr: Expression): Identifier | null {
  if (expr.isKind(SyntaxKind.CallExpression)) {
    return findRootIdentifier(expr.getExpression());
  }
  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    return findRootIdentifier(expr.getExpression());
  }
  if (expr.isKind(SyntaxKind.Identifier)) {
    return expr;
  }
  return null;
}
