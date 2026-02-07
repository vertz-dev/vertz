import type { CallExpression, Expression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { HttpMethod, ModuleDefContext, RouteIR, RouterIR, SchemaRef } from '../ir/types';
import { createDiagnosticFromLocation } from '../errors';
import { extractObjectLiteral, findMethodCallsOnVariable, getArrayElements, getPropertyValue, getSourceLocation, getStringValue, getVariableNameForCall } from '../utils/ast-helpers';
import { resolveIdentifier } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';
import { createInlineSchemaRef, createNamedSchemaRef, isSchemaExpression } from './schema-analyzer';
import { parseInjectRefs } from './service-analyzer';

export interface RouteAnalyzerResult {
  routers: RouterIR[];
}

const HTTP_METHODS: Record<string, HttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
};

export class RouteAnalyzer extends BaseAnalyzer<RouteAnalyzerResult> {
  async analyze(): Promise<RouteAnalyzerResult> {
    return { routers: [] };
  }

  async analyzeForModules(context: ModuleDefContext): Promise<RouteAnalyzerResult> {
    const routers: RouterIR[] = [];

    const knownModuleDefVars = new Set(context.moduleDefVariables.keys());

    for (const file of this.project.getSourceFiles()) {
      for (const [moduleDefVar, moduleName] of context.moduleDefVariables) {
        const routerCalls = findMethodCallsOnVariable(file, moduleDefVar, 'router');
        for (const call of routerCalls) {
          const varName = getVariableNameForCall(call);
          if (!varName) continue;

          const obj = extractObjectLiteral(call, 0);
          const prefixExpr = obj ? getPropertyValue(obj, 'prefix') : null;
          const prefix = prefixExpr ? getStringValue(prefixExpr) ?? '/' : '/';
          if (!prefixExpr) {
            this.addDiagnostic(createDiagnosticFromLocation(getSourceLocation(call), {
              severity: 'warning',
              code: 'VERTZ_RT_MISSING_PREFIX',
              message: "Router should have a 'prefix' property.",
              suggestion: "Add a 'prefix' property to the router config.",
            }));
          }

          const loc = getSourceLocation(call);

          const injectExpr = obj ? getPropertyValue(obj, 'inject') : null;
          const inject = injectExpr?.isKind(SyntaxKind.ObjectLiteralExpression)
            ? parseInjectRefs(injectExpr)
            : [];

          const routes = this.extractRoutes(file, varName, prefix, moduleName);

          routers.push({
            name: varName,
            moduleName,
            ...loc,
            prefix,
            inject,
            routes,
          });
        }
      }

      this.detectUnknownRouterCalls(file, knownModuleDefVars);
    }

    return { routers };
  }

  private detectUnknownRouterCalls(
    file: SourceFile,
    knownModuleDefVars: Set<string>,
  ): void {
    const allCalls = file.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of allCalls) {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;
      if (expr.getName() !== 'router') continue;
      const obj = expr.getExpression();
      if (!obj.isKind(SyntaxKind.Identifier)) continue;
      if (knownModuleDefVars.has(obj.getText())) continue;
      // This is a .router() call on an unknown variable
      this.addDiagnostic(createDiagnosticFromLocation(getSourceLocation(call), {
        severity: 'error',
        code: 'VERTZ_RT_UNKNOWN_MODULE_DEF',
        message: `'${obj.getText()}' is not a known moduleDef variable.`,
        suggestion: 'Ensure the variable is declared with vertz.moduleDef() and is included in the module context.',
      }));
    }
  }

  private extractRoutes(
    file: SourceFile,
    routerVarName: string,
    prefix: string,
    moduleName: string,
  ): RouteIR[] {
    const routes: RouteIR[] = [];
    const usedOperationIds = new Set<string>();

    for (const [methodName, httpMethod] of Object.entries(HTTP_METHODS)) {
      const directCalls = findMethodCallsOnVariable(file, routerVarName, methodName);
      const chainedCalls = this.findChainedHttpCalls(file, routerVarName, methodName);
      const allCalls = [...directCalls, ...chainedCalls];
      for (const call of allCalls) {
        const route = this.extractRoute(call, httpMethod, prefix, moduleName, file, usedOperationIds);
        if (route) routes.push(route);
      }
    }

    return routes;
  }

  private findChainedHttpCalls(
    file: SourceFile,
    routerVarName: string,
    methodName: string,
  ): CallExpression[] {
    return file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return false;
      if (expr.getName() !== methodName) return false;
      const obj = expr.getExpression();
      // Only match chained calls (object is a CallExpression, not an Identifier)
      if (!obj.isKind(SyntaxKind.CallExpression)) return false;
      return this.chainResolvesToVariable(obj, routerVarName);
    });
  }

  private chainResolvesToVariable(
    expr: Expression,
    varName: string,
  ): boolean {
    if (expr.isKind(SyntaxKind.Identifier)) {
      return expr.getText() === varName;
    }
    if (expr.isKind(SyntaxKind.CallExpression)) {
      const inner = expr.getExpression();
      if (inner.isKind(SyntaxKind.PropertyAccessExpression)) {
        return this.chainResolvesToVariable(inner.getExpression(), varName);
      }
    }
    return false;
  }

  private extractRoute(
    call: CallExpression,
    method: HttpMethod,
    prefix: string,
    moduleName: string,
    file: SourceFile,
    usedOperationIds: Set<string>,
  ): RouteIR | null {
    const args = call.getArguments();
    const pathArg = args[0];
    if (!pathArg) return null;

    const path = getStringValue(pathArg as Expression);
    if (path === null) {
      this.addDiagnostic(createDiagnosticFromLocation(getSourceLocation(call), {
        severity: 'error',
        code: 'VERTZ_RT_DYNAMIC_PATH',
        message: 'Route paths must be string literals for static analysis.',
        suggestion: 'Use a string literal for the route path.',
      }));
      return null;
    }

    const fullPath = joinPaths(prefix, path);
    const loc = getSourceLocation(call);
    const filePath = file.getFilePath();

    const obj = extractObjectLiteral(call, 1);
    if (!obj && args.length > 1) {
      this.addDiagnostic(createDiagnosticFromLocation(loc, {
        severity: 'warning',
        code: 'VERTZ_RT_DYNAMIC_CONFIG',
        message: 'Route config must be an object literal for static analysis.',
        suggestion: 'Pass an inline object literal as the second argument.',
      }));
    }

    const params = obj ? this.resolveSchemaRef(obj, 'params', filePath) : undefined;
    const query = obj ? this.resolveSchemaRef(obj, 'query', filePath) : undefined;
    const body = obj ? this.resolveSchemaRef(obj, 'body', filePath) : undefined;
    const headers = obj ? this.resolveSchemaRef(obj, 'headers', filePath) : undefined;
    const response = obj ? this.resolveSchemaRef(obj, 'response', filePath) : undefined;

    const middleware = obj ? this.extractMiddlewareRefs(obj, filePath) : [];

    const descriptionExpr = obj ? getPropertyValue(obj, 'description') : null;
    const description = descriptionExpr ? getStringValue(descriptionExpr) ?? undefined : undefined;

    const tagsExpr = obj ? getPropertyValue(obj, 'tags') : null;
    const tags = tagsExpr
      ? getArrayElements(tagsExpr).map((e) => getStringValue(e)).filter((v): v is string => v !== null)
      : [];

    const handlerExpr = obj ? getPropertyValue(obj, 'handler') : null;
    const operationId = this.generateOperationId(moduleName, method, path, handlerExpr, usedOperationIds);

    if (obj && !handlerExpr) {
      this.addDiagnostic(createDiagnosticFromLocation(loc, {
        severity: 'error',
        code: 'VERTZ_RT_MISSING_HANDLER',
        message: "Route must have a 'handler' property.",
        suggestion: "Add a 'handler' property to the route config.",
      }));
    }

    return {
      method,
      path,
      fullPath,
      ...loc,
      operationId,
      params,
      query,
      body,
      headers,
      response,
      middleware,
      description,
      tags,
    };
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

  private extractMiddlewareRefs(
    obj: ObjectLiteralExpression,
    filePath: string,
  ): { name: string; sourceFile: string }[] {
    const expr = getPropertyValue(obj, 'middlewares');
    if (!expr) return [];

    const elements = getArrayElements(expr);
    return elements
      .filter((el) => el.isKind(SyntaxKind.Identifier))
      .map((el) => {
        const resolved = resolveIdentifier(el as import('ts-morph').Identifier, this.project);
        return {
          name: el.getText(),
          sourceFile: resolved ? resolved.sourceFile.getFilePath() : filePath,
        };
      });
  }

  private generateOperationId(
    moduleName: string,
    method: HttpMethod,
    path: string,
    handlerExpr: import('ts-morph').Expression | null,
    usedIds: Set<string>,
  ): string {
    let id: string;

    if (handlerExpr) {
      if (handlerExpr.isKind(SyntaxKind.Identifier)) {
        id = `${moduleName}_${handlerExpr.getText()}`;
      } else if (handlerExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
        id = `${moduleName}_${handlerExpr.getName()}`;
      } else {
        id = `${moduleName}_${method.toLowerCase()}_${sanitizePath(path)}`;
      }
    } else {
      id = `${moduleName}_${method.toLowerCase()}_${sanitizePath(path)}`;
    }

    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }

    let counter = 2;
    while (usedIds.has(`${id}_${counter}`)) counter++;
    const uniqueId = `${id}_${counter}`;
    usedIds.add(uniqueId);
    return uniqueId;
  }
}

function joinPaths(prefix: string, path: string): string {
  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (path === '/') return normalizedPrefix || '/';
  return normalizedPrefix + path;
}

function sanitizePath(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/[/:.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'root';
}
