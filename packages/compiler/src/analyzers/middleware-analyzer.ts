import type { ObjectLiteralExpression } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { MiddlewareIR, SchemaRef } from '../ir/types';
import { createDiagnosticFromLocation } from '../errors';
import { extractObjectLiteral, findCallExpressions, getPropertyValue, getSourceLocation, getStringValue } from '../utils/ast-helpers';
import { resolveIdentifier } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';
import { createInlineSchemaRef, createNamedSchemaRef, isSchemaExpression } from './schema-analyzer';
import { parseInjectRefs } from './service-analyzer';

export interface MiddlewareAnalyzerResult {
  middleware: MiddlewareIR[];
}

export class MiddlewareAnalyzer extends BaseAnalyzer<MiddlewareAnalyzerResult> {
  async analyze(): Promise<MiddlewareAnalyzerResult> {
    const middleware: MiddlewareIR[] = [];

    for (const file of this.project.getSourceFiles()) {
      const calls = findCallExpressions(file, 'vertz', 'middleware');
      for (const call of calls) {
        const obj = extractObjectLiteral(call, 0);
        if (!obj) {
          const callLoc = getSourceLocation(call);
          this.addDiagnostic(createDiagnosticFromLocation(callLoc, {
            severity: 'warning',
            code: 'VERTZ_MW_NON_OBJECT_CONFIG',
            message: 'Middleware config must be an object literal for static analysis.',
            suggestion: 'Pass an inline object literal to vertz.middleware().',
          }));
          continue;
        }

        const loc = getSourceLocation(call);
        const nameExpr = getPropertyValue(obj, 'name');
        if (!nameExpr) {
          this.addDiagnostic(createDiagnosticFromLocation(loc, {
            severity: 'error',
            code: 'VERTZ_MW_MISSING_NAME',
            message: "Middleware must have a 'name' property.",
            suggestion: "Add a 'name' property to the middleware config.",
          }));
          continue;
        }
        const name = getStringValue(nameExpr);
        if (!name) {
          this.addDiagnostic(createDiagnosticFromLocation(loc, {
            severity: 'warning',
            code: 'VERTZ_MW_DYNAMIC_NAME',
            message: 'Middleware name should be a string literal for static analysis.',
            suggestion: 'Use a string literal for the middleware name.',
          }));
          continue;
        }

        const handlerExpr = getPropertyValue(obj, 'handler');
        if (!handlerExpr) {
          this.addDiagnostic(createDiagnosticFromLocation(loc, {
            severity: 'error',
            code: 'VERTZ_MW_MISSING_HANDLER',
            message: "Middleware must have a 'handler' property.",
            suggestion: "Add a 'handler' property to the middleware config.",
          }));
        }

        const injectExpr = getPropertyValue(obj, 'inject');
        const inject = injectExpr?.isKind(SyntaxKind.ObjectLiteralExpression)
          ? parseInjectRefs(injectExpr)
          : [];

        const filePath = file.getFilePath();
        const headers = this.resolveSchemaRef(obj, 'headers', filePath);
        const params = this.resolveSchemaRef(obj, 'params', filePath);
        const query = this.resolveSchemaRef(obj, 'query', filePath);
        const body = this.resolveSchemaRef(obj, 'body', filePath);
        const requires = this.resolveSchemaRef(obj, 'requires', filePath);
        const provides = this.resolveSchemaRef(obj, 'provides', filePath);

        middleware.push({
          name,
          ...loc,
          inject,
          headers,
          params,
          query,
          body,
          requires,
          provides,
        });
      }
    }

    return { middleware };
  }

  private resolveSchemaRef(
    obj: ObjectLiteralExpression,
    prop: string,
    filePath: string,
  ): SchemaRef | undefined {
    const expr = getPropertyValue(obj, prop);
    if (!expr) return undefined;

    if (expr.isKind(SyntaxKind.Identifier)) {
      const resolved = resolveIdentifier(expr, this.project);
      const resolvedPath = resolved ? resolved.sourceFile.getFilePath() : filePath;
      return createNamedSchemaRef(expr.getText(), resolvedPath);
    }

    if (isSchemaExpression(expr.getSourceFile(), expr)) {
      return createInlineSchemaRef(filePath);
    }

    return undefined;
  }
}
