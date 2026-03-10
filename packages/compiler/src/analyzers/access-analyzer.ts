import type { CallExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { AccessEntityIR, AccessIR } from '../ir/types';
import {
  extractObjectLiteral,
  getArrayElements,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
} from '../utils/ast-helpers';
import { isFromImport } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

export interface AccessAnalyzerResult {
  access?: AccessIR;
}

export class AccessAnalyzer extends BaseAnalyzer<AccessAnalyzerResult> {
  async analyze(): Promise<AccessAnalyzerResult> {
    const files = this.project.getSourceFiles();
    const calls: { call: CallExpression; file: SourceFile }[] = [];

    for (const file of files) {
      const found = this.findDefineAccessCalls(file);
      for (const call of found) {
        calls.push({ call, file });
      }
    }

    if (calls.length === 0) {
      return { access: undefined };
    }

    if (calls.length > 1) {
      for (const { call } of calls.slice(1)) {
        this.addDiagnostic({
          code: 'ACCESS_MULTIPLE_DEFINITIONS',
          severity: 'error',
          message: 'Only one defineAccess() call is allowed per application',
          ...getSourceLocation(call),
        });
      }
    }

    const first = calls[0];
    if (!first) return { access: undefined };
    const { call } = first;
    const access = this.extractAccess(call);

    return { access };
  }

  private findDefineAccessCalls(file: SourceFile): CallExpression[] {
    const validCalls: CallExpression[] = [];

    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();

      // Direct: defineAccess(...) or aliased: da(...)
      if (expr.isKind(SyntaxKind.Identifier)) {
        if (isFromImport(expr, '@vertz/server')) {
          const name = expr.getText();
          // Resolve the original name from the import
          const sourceFile = expr.getSourceFile();
          const importDecls = sourceFile.getImportDeclarations();
          for (const decl of importDecls) {
            if (decl.getModuleSpecifierValue() !== '@vertz/server') continue;
            for (const specifier of decl.getNamedImports()) {
              const importedName = specifier.getName();
              const alias = specifier.getAliasNode()?.getText();
              if (
                importedName === 'defineAccess' &&
                (alias === name || (!alias && importedName === name))
              ) {
                validCalls.push(call);
              }
            }
          }
        }
        continue;
      }

      // Namespace: server.defineAccess(...)
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propName = expr.getName();
        if (propName !== 'defineAccess') continue;
        const obj = expr.getExpression();
        if (!obj.isKind(SyntaxKind.Identifier)) continue;
        const sourceFile = obj.getSourceFile();
        const importDecl = sourceFile
          .getImportDeclarations()
          .find(
            (d) =>
              d.getModuleSpecifierValue() === '@vertz/server' &&
              d.getNamespaceImport()?.getText() === obj.getText(),
          );
        if (importDecl) {
          validCalls.push(call);
        }
      }
    }

    return validCalls;
  }

  private extractAccess(call: CallExpression): AccessIR | undefined {
    const configObj = extractObjectLiteral(call, 0);
    if (!configObj) return undefined;

    const loc = getSourceLocation(call);

    // Extract entities
    const entities: AccessEntityIR[] = [];
    const entitiesExpr = getPropertyValue(configObj, 'entities');
    if (entitiesExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      for (const prop of getProperties(entitiesExpr)) {
        const roles: string[] = [];
        if (prop.value.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const rolesExpr = getPropertyValue(prop.value, 'roles');
          if (rolesExpr) {
            for (const el of getArrayElements(rolesExpr)) {
              const role = getStringValue(el);
              if (role !== null) {
                roles.push(role);
              } else {
                this.addDiagnostic({
                  code: 'ACCESS_NON_LITERAL_ROLE',
                  severity: 'warning',
                  message: `Role in entity "${prop.name}" must be a string literal`,
                  ...getSourceLocation(el),
                });
              }
            }
          }
        }
        entities.push({ name: prop.name, roles });
      }
    }

    // Extract entitlements
    const entitlements: string[] = [];
    const entitlementsExpr = getPropertyValue(configObj, 'entitlements');
    if (entitlementsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      for (const prop of entitlementsExpr.getProperties()) {
        if (prop.isKind(SyntaxKind.PropertyAssignment)) {
          const name = prop.getName();
          // Strip quotes from property name (getName returns the raw name)
          const cleanName = name.replace(/^['"]|['"]$/g, '');
          entitlements.push(cleanName);
        } else if (prop.isKind(SyntaxKind.SpreadAssignment)) {
          this.addDiagnostic({
            code: 'ACCESS_NON_LITERAL_KEY',
            severity: 'warning',
            message:
              'Spread in entitlements object cannot be statically analyzed — these entitlements will not be type-checked',
            ...getSourceLocation(prop),
          });
        }
      }
    }

    return {
      entities,
      entitlements,
      sourceFile: loc.sourceFile,
      sourceLine: loc.sourceLine,
      sourceColumn: loc.sourceColumn,
    };
  }
}
