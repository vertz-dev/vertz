import type { CallExpression, Expression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { DatabaseIR, SourceLocation } from '../ir/types';
import { extractObjectLiteral, getPropertyValue, getSourceLocation } from '../utils/ast-helpers';
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

    // getPropertyValue handles both PropertyAssignment and ShorthandPropertyAssignment
    const modelsValue = getPropertyValue(config, 'models');
    if (!modelsValue) return null;

    const modelsObj = this.resolveObjectLiteral(modelsValue);
    if (!modelsObj) return null;

    const modelKeys = this.extractModelKeys(modelsObj, loc);
    return { modelKeys, ...loc };
  }

  /**
   * Resolves an expression to an ObjectLiteralExpression.
   * Handles inline object literals and variable references.
   */
  private resolveObjectLiteral(expr: Expression): ObjectLiteralExpression | null {
    // Inline: { users: usersModel }
    if (expr.isKind(SyntaxKind.ObjectLiteralExpression)) return expr;

    // Variable reference: models or myModels
    if (expr.isKind(SyntaxKind.Identifier)) {
      const defs = expr.getDefinitionNodes();
      for (const def of defs) {
        if (def.isKind(SyntaxKind.VariableDeclaration)) {
          const init = def.getInitializer();
          if (init?.isKind(SyntaxKind.ObjectLiteralExpression)) return init;
        }
      }
    }

    return null;
  }

  /**
   * Extracts property keys from a models object, emitting warnings for
   * spread assignments and computed property names that can't be resolved.
   */
  private extractModelKeys(obj: ObjectLiteralExpression, loc: SourceLocation): string[] {
    const keys: string[] = [];

    for (const prop of obj.getProperties()) {
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        if (prop.getNameNode().isKind(SyntaxKind.ComputedPropertyName)) {
          this.addDiagnostic({
            severity: 'warning',
            code: 'ENTITY_MODEL_NOT_REGISTERED',
            message:
              'createDb() models object contains a computed property name. ' +
              'Entity-model registration check may be incomplete — ' +
              'computed keys cannot be statically resolved.',
            ...loc,
          });
        } else {
          keys.push(prop.getName());
        }
      } else if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
        keys.push(prop.getName());
      } else if (prop.isKind(SyntaxKind.SpreadAssignment)) {
        this.addDiagnostic({
          severity: 'warning',
          code: 'ENTITY_MODEL_NOT_REGISTERED',
          message:
            'createDb() models object contains a spread assignment. ' +
            'Entity-model registration check may be incomplete — ' +
            'spread properties cannot be statically resolved.',
          ...loc,
        });
      }
    }

    return keys;
  }
}
