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
            moduleName: '',
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
      const firstChar = entity.at(0);
      if (!firstChar || firstChar !== firstChar.toUpperCase()) continue;
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
  // Walk the call chain looking for .id('SomeString') anywhere in it
  let current: Expression = expr;
  while (current.isKind(SyntaxKind.CallExpression)) {
    const access = current.getExpression();
    if (access.isKind(SyntaxKind.PropertyAccessExpression) && access.getName() === 'id') {
      const args = current.getArguments();
      if (args.length === 1) {
        const firstArg = args.at(0);
        const value = firstArg ? getStringValue(firstArg as Expression) : null;
        if (value !== null) return value;
      }
    }
    // Move to the receiver of this call (e.g., .describe('...') → the expression before .describe)
    if (access.isKind(SyntaxKind.PropertyAccessExpression)) {
      current = access.getExpression();
    } else {
      break;
    }
  }
  return null;
}

export function isSchemaFile(file: SourceFile): boolean {
  return file
    .getImportDeclarations()
    .some((decl) => decl.getModuleSpecifierValue() === '@vertz/schema');
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
