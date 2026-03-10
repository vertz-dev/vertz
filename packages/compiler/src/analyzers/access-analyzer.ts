import type { CallExpression, Expression, Node, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type {
  AccessEntityIR,
  AccessIR,
  AccessWhereClauseIR,
  AccessWhereCondition,
} from '../ir/types';
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
    const seenEntitlements = new Set<string>();
    const entitlementsExpr = getPropertyValue(configObj, 'entitlements');
    if (entitlementsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      for (const prop of entitlementsExpr.getProperties()) {
        if (
          prop.isKind(SyntaxKind.PropertyAssignment) ||
          prop.isKind(SyntaxKind.MethodDeclaration)
        ) {
          const name = prop.getName();
          // Strip quotes from property name (getName returns the raw name)
          const cleanName = name.replace(/^['"]|['"]$/g, '');
          if (seenEntitlements.has(cleanName)) {
            this.addDiagnostic({
              code: 'ACCESS_DUPLICATE_ENTITLEMENT',
              severity: 'warning',
              message: `Duplicate entitlement "${cleanName}" — only the first occurrence is used`,
              ...getSourceLocation(prop),
            });
          } else {
            seenEntitlements.add(cleanName);
            entitlements.push(cleanName);
          }
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

    // Extract where clauses from entitlement callbacks
    const whereClauses = this.extractWhereClauses(configObj);

    return {
      entities,
      entitlements,
      whereClauses,
      sourceFile: loc.sourceFile,
      sourceLine: loc.sourceLine,
      sourceColumn: loc.sourceColumn,
    };
  }

  private extractWhereClauses(configObj: ObjectLiteralExpression): AccessWhereClauseIR[] {
    const clauses: AccessWhereClauseIR[] = [];
    const entitlementsExpr = getPropertyValue(configObj, 'entitlements');
    if (!entitlementsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return clauses;

    for (const prop of entitlementsExpr.getProperties()) {
      if (
        !prop.isKind(SyntaxKind.PropertyAssignment) &&
        !prop.isKind(SyntaxKind.MethodDeclaration)
      ) {
        continue;
      }
      const entName = prop.getName().replace(/^['"]|['"]$/g, '');

      // Find where() calls within this entitlement's value
      const whereCalls = this.findWhereCalls(prop);
      const allConditions: AccessWhereCondition[] = [];
      for (const whereCall of whereCalls) {
        const conditions = this.extractWhereConditions(whereCall);
        allConditions.push(...conditions);
      }
      if (allConditions.length > 0) {
        clauses.push({ entitlement: entName, conditions: allConditions });
      }
    }

    return clauses;
  }

  /** Find all .where() calls within a node — handles both r.where() and rules.where() */
  private findWhereCalls(expr: Node): CallExpression[] {
    const calls: CallExpression[] = [];
    for (const call of expr.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callExpr = call.getExpression();
      if (callExpr.isKind(SyntaxKind.PropertyAccessExpression) && callExpr.getName() === 'where') {
        calls.push(call);
      }
    }
    return calls;
  }

  /** Extract conditions from a where({ column: value }) call argument */
  private extractWhereConditions(call: CallExpression): AccessWhereCondition[] {
    const conditions: AccessWhereCondition[] = [];
    const arg = call.getArguments()[0];
    if (!arg?.isKind(SyntaxKind.ObjectLiteralExpression)) return conditions;

    for (const prop of arg.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
      const column = prop.getName().replace(/^['"]|['"]$/g, '');
      const init = prop.getInitializer();
      if (!init) continue;

      const condition = this.extractConditionValue(column, init);
      if (condition) {
        conditions.push(condition);
      } else {
        this.addDiagnostic({
          code: 'ACCESS_WHERE_NOT_TRANSLATABLE',
          severity: 'warning',
          message: `Where condition for column "${column}" cannot be statically analyzed — no RLS policy will be generated`,
          ...getSourceLocation(init),
        });
      }
    }

    return conditions;
  }

  /** Resolve a condition value to a marker or literal */
  private extractConditionValue(
    column: string,
    expr: Expression,
  ): AccessWhereCondition | undefined {
    // Check for r.user.id or r.user.tenantId (PropertyAccessExpression chain)
    if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const text = expr.getText();
      // Match patterns like r.user.id, r.user.tenantId, rules.user.id, rules.user.tenantId
      const markerMatch = text.match(/\.\buser\.(id|tenantId)$/);
      if (markerMatch) {
        const marker = `user.${markerMatch[1]}` as 'user.id' | 'user.tenantId';
        return { kind: 'marker', column, marker };
      }
    }

    // String literal
    const strVal = getStringValue(expr);
    if (strVal !== null) {
      return { kind: 'literal', column, value: strVal };
    }

    // Boolean literal
    if (expr.isKind(SyntaxKind.TrueKeyword)) {
      return { kind: 'literal', column, value: true };
    }
    if (expr.isKind(SyntaxKind.FalseKeyword)) {
      return { kind: 'literal', column, value: false };
    }

    // Numeric literal
    if (expr.isKind(SyntaxKind.NumericLiteral)) {
      return { kind: 'literal', column, value: Number(expr.getText()) };
    }

    return undefined;
  }
}
