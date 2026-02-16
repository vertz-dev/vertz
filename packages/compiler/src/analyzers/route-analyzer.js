import { SyntaxKind } from 'ts-morph';
import { createDiagnosticFromLocation } from '../errors';
import {
  extractObjectLiteral,
  findMethodCallsOnVariable,
  getArrayElements,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
  getVariableNameForCall,
} from '../utils/ast-helpers';
import { resolveIdentifier } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';
import { createInlineSchemaRef, createNamedSchemaRef, isSchemaExpression } from './schema-analyzer';
import { parseInjectRefs } from './service-analyzer';

const HTTP_METHODS = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
};
export class RouteAnalyzer extends BaseAnalyzer {
  async analyze() {
    return { routers: [] };
  }
  async analyzeForModules(context) {
    const routers = [];
    const knownModuleDefVars = new Set(context.moduleDefVariables.keys());
    for (const file of this.project.getSourceFiles()) {
      for (const [moduleDefVar, moduleName] of context.moduleDefVariables) {
        const routerCalls = findMethodCallsOnVariable(file, moduleDefVar, 'router');
        for (const call of routerCalls) {
          const varName = getVariableNameForCall(call);
          if (!varName) continue;
          const obj = extractObjectLiteral(call, 0);
          const prefixExpr = obj ? getPropertyValue(obj, 'prefix') : null;
          const prefix = prefixExpr ? (getStringValue(prefixExpr) ?? '/') : '/';
          if (!prefixExpr) {
            this.addDiagnostic(
              createDiagnosticFromLocation(getSourceLocation(call), {
                severity: 'warning',
                code: 'VERTZ_RT_MISSING_PREFIX',
                message: "Router should have a 'prefix' property.",
                suggestion: "Add a 'prefix' property to the router config.",
              }),
            );
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
  detectUnknownRouterCalls(file, knownModuleDefVars) {
    const allCalls = file.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of allCalls) {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;
      if (expr.getName() !== 'router') continue;
      const obj = expr.getExpression();
      if (!obj.isKind(SyntaxKind.Identifier)) continue;
      if (knownModuleDefVars.has(obj.getText())) continue;
      // Only flag if the result variable is used with HTTP method calls,
      // to avoid false positives on unrelated .router() calls (e.g., express)
      const varName = getVariableNameForCall(call);
      if (!varName) continue;
      const hasHttpMethodCalls = Object.keys(HTTP_METHODS).some(
        (method) => findMethodCallsOnVariable(file, varName, method).length > 0,
      );
      if (!hasHttpMethodCalls) continue;
      this.addDiagnostic(
        createDiagnosticFromLocation(getSourceLocation(call), {
          severity: 'error',
          code: 'VERTZ_RT_UNKNOWN_MODULE_DEF',
          message: `'${obj.getText()}' is not a known moduleDef variable.`,
          suggestion:
            'Ensure the variable is declared with vertz.moduleDef() and is included in the module context.',
        }),
      );
    }
  }
  extractRoutes(file, routerVarName, prefix, moduleName) {
    const routes = [];
    const usedOperationIds = new Set();
    for (const [methodName, httpMethod] of Object.entries(HTTP_METHODS)) {
      const directCalls = findMethodCallsOnVariable(file, routerVarName, methodName);
      const chainedCalls = this.findChainedHttpCalls(file, routerVarName, methodName);
      const allCalls = [...directCalls, ...chainedCalls];
      for (const call of allCalls) {
        const route = this.extractRoute(
          call,
          httpMethod,
          prefix,
          moduleName,
          file,
          usedOperationIds,
        );
        if (route) routes.push(route);
      }
    }
    return routes;
  }
  findChainedHttpCalls(file, routerVarName, methodName) {
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
  chainResolvesToVariable(expr, varName) {
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
  extractRoute(call, method, prefix, moduleName, file, usedOperationIds) {
    const args = call.getArguments();
    const pathArg = args[0];
    if (!pathArg) return null;
    const path = getStringValue(pathArg);
    if (path === null) {
      this.addDiagnostic(
        createDiagnosticFromLocation(getSourceLocation(call), {
          severity: 'error',
          code: 'VERTZ_RT_DYNAMIC_PATH',
          message: 'Route paths must be string literals for static analysis.',
          suggestion: 'Use a string literal for the route path.',
        }),
      );
      return null;
    }
    const fullPath = joinPaths(prefix, path);
    const loc = getSourceLocation(call);
    const filePath = file.getFilePath();
    const obj = extractObjectLiteral(call, 1);
    if (!obj && args.length > 1) {
      this.addDiagnostic(
        createDiagnosticFromLocation(loc, {
          severity: 'warning',
          code: 'VERTZ_RT_DYNAMIC_CONFIG',
          message: 'Route config must be an object literal for static analysis.',
          suggestion: 'Pass an inline object literal as the second argument.',
        }),
      );
    }
    const params = obj ? this.resolveSchemaRef(obj, 'params', filePath) : undefined;
    const query = obj ? this.resolveSchemaRef(obj, 'query', filePath) : undefined;
    const body = obj ? this.resolveSchemaRef(obj, 'body', filePath) : undefined;
    const headers = obj ? this.resolveSchemaRef(obj, 'headers', filePath) : undefined;
    const response = obj ? this.resolveSchemaRef(obj, 'response', filePath) : undefined;
    const middleware = obj ? this.extractMiddlewareRefs(obj, filePath) : [];
    const descriptionExpr = obj ? getPropertyValue(obj, 'description') : null;
    const description = descriptionExpr
      ? (getStringValue(descriptionExpr) ?? undefined)
      : undefined;
    const tagsExpr = obj ? getPropertyValue(obj, 'tags') : null;
    const tags = tagsExpr
      ? getArrayElements(tagsExpr)
          .map((e) => getStringValue(e))
          .filter((v) => v !== null)
      : [];
    const handlerExpr = obj ? getPropertyValue(obj, 'handler') : null;
    const operationId = this.generateOperationId(
      moduleName,
      method,
      path,
      handlerExpr,
      usedOperationIds,
    );
    if (obj && !handlerExpr) {
      this.addDiagnostic(
        createDiagnosticFromLocation(loc, {
          severity: 'error',
          code: 'VERTZ_RT_MISSING_HANDLER',
          message: "Route must have a 'handler' property.",
          suggestion: "Add a 'handler' property to the route config.",
        }),
      );
      return null;
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
  resolveSchemaRef(obj, prop, filePath) {
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
  extractMiddlewareRefs(obj, filePath) {
    const expr = getPropertyValue(obj, 'middlewares');
    if (!expr) return [];
    const elements = getArrayElements(expr);
    return elements
      .filter((el) => el.isKind(SyntaxKind.Identifier))
      .map((el) => {
        const resolved = resolveIdentifier(el, this.project);
        return {
          name: el.getText(),
          sourceFile: resolved ? resolved.sourceFile.getFilePath() : filePath,
        };
      });
  }
  generateOperationId(moduleName, method, path, handlerExpr, usedIds) {
    let handlerName = null;
    if (handlerExpr?.isKind(SyntaxKind.Identifier)) {
      handlerName = handlerExpr.getText();
    } else if (handlerExpr?.isKind(SyntaxKind.PropertyAccessExpression)) {
      handlerName = handlerExpr.getName();
    }
    const id = handlerName
      ? `${moduleName}_${handlerName}`
      : `${moduleName}_${method.toLowerCase()}_${sanitizePath(path)}`;
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
function joinPaths(prefix, path) {
  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (path === '/') return normalizedPrefix || '/';
  return normalizedPrefix + path;
}
function sanitizePath(path) {
  return (
    path.replace(/^\//, '').replace(/[/:.]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') ||
    'root'
  );
}
//# sourceMappingURL=route-analyzer.js.map
