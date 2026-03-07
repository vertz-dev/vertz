import type { CallExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { DatabaseIR } from '../ir/types';
import { extractObjectLiteral, getProperties, getSourceLocation } from '../utils/ast-helpers';
import { isFromImport } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

export interface DatabaseAnalyzerResult {
  databases: DatabaseIR[];
}

export class DatabaseAnalyzer extends BaseAnalyzer<DatabaseAnalyzerResult> {
  async analyze(): Promise<DatabaseAnalyzerResult> {
    const databases: DatabaseIR[] = [];

    for (const file of this.project.getSourceFiles()) {
      const calls = this.findCreateDbCalls(file);
      for (const call of calls) {
        const db = this.extractDatabase(call);
        if (db) databases.push(db);
      }
    }

    return { databases };
  }

  private findCreateDbCalls(file: SourceFile): CallExpression[] {
    const validCalls: CallExpression[] = [];

    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();

      // Direct: createDb(...) or aliased
      if (expr.isKind(SyntaxKind.Identifier)) {
        if (isFromImport(expr, '@vertz/db')) {
          validCalls.push(call);
        }
        continue;
      }

      // Namespace: db.createDb(...)
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propName = expr.getName();
        if (propName !== 'createDb') continue;
        const obj = expr.getExpression();
        if (!obj.isKind(SyntaxKind.Identifier)) continue;
        const sourceFile = obj.getSourceFile();
        const importDecl = sourceFile
          .getImportDeclarations()
          .find(
            (d) =>
              d.getModuleSpecifierValue() === '@vertz/db' &&
              d.getNamespaceImport()?.getText() === obj.getText(),
          );
        if (importDecl) {
          validCalls.push(call);
        }
      }
    }

    return validCalls;
  }

  private extractDatabase(call: CallExpression): DatabaseIR | null {
    const loc = getSourceLocation(call);
    const config = extractObjectLiteral(call, 0);
    if (!config) return null;

    const modelsExpr = config
      .getProperty('models')
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.asKind(SyntaxKind.ObjectLiteralExpression);

    if (!modelsExpr) return null;

    const modelKeys = getProperties(modelsExpr).map((p) => p.name);

    return { modelKeys, ...loc };
  }
}
