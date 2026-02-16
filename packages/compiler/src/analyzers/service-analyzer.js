import { SyntaxKind } from 'ts-morph';
import {
  extractObjectLiteral,
  findMethodCallsOnVariable,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getVariableNameForCall,
} from '../utils/ast-helpers';
import { BaseAnalyzer } from './base-analyzer';
export class ServiceAnalyzer extends BaseAnalyzer {
  async analyze() {
    return { services: [] };
  }
  async analyzeForModule(moduleDefVarName, moduleName) {
    const services = [];
    for (const file of this.project.getSourceFiles()) {
      const calls = findMethodCallsOnVariable(file, moduleDefVarName, 'service');
      for (const call of calls) {
        const name = getVariableNameForCall(call);
        if (!name) continue;
        const obj = extractObjectLiteral(call, 0);
        const inject = obj ? parseInjectFromObj(obj) : [];
        const methods = obj ? parseMethodsFromObj(obj) : [];
        const loc = getSourceLocation(call);
        services.push({
          name,
          moduleName,
          ...loc,
          inject,
          methods,
        });
      }
    }
    return services;
  }
}
function parseInjectFromObj(obj) {
  const injectExpr = getPropertyValue(obj, 'inject');
  if (!injectExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];
  return parseInjectRefs(injectExpr);
}
function parseMethodsFromObj(obj) {
  const methodsExpr = getPropertyValue(obj, 'methods');
  if (!methodsExpr) return [];
  return extractMethodSignatures(methodsExpr);
}
export function parseInjectRefs(obj) {
  return getProperties(obj).map(({ name, value }) => {
    const resolvedToken = value.isKind(SyntaxKind.Identifier) ? value.getText() : name;
    return { localName: name, resolvedToken };
  });
}
export function extractMethodSignatures(expr) {
  if (!expr.isKind(SyntaxKind.ArrowFunction) && !expr.isKind(SyntaxKind.FunctionExpression)) {
    return [];
  }
  const body = expr.getBody();
  let returnObj = null;
  if (body.isKind(SyntaxKind.ObjectLiteralExpression)) {
    // Arrow with implicit return: (deps) => ({ ... })
    // ts-morph wraps parenthesized expression — the body IS the object literal
    returnObj = body;
  } else if (body.isKind(SyntaxKind.ParenthesizedExpression)) {
    const inner = body.getExpression();
    if (inner.isKind(SyntaxKind.ObjectLiteralExpression)) {
      returnObj = inner;
    }
  } else if (body.isKind(SyntaxKind.Block)) {
    const returnStmt = body.getStatements().find((s) => s.isKind(SyntaxKind.ReturnStatement));
    const retExpr = returnStmt?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
    if (retExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      returnObj = retExpr;
    }
  }
  if (!returnObj) return [];
  const methods = [];
  for (const prop of returnObj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
    const methodName = prop.getName();
    const init = prop.getInitializer();
    if (!init) continue;
    const params = extractFunctionParams(init);
    const returnType = inferReturnType(init);
    methods.push({
      name: methodName,
      parameters: params,
      returnType,
    });
  }
  return methods;
}
function extractFunctionParams(expr) {
  if (!expr.isKind(SyntaxKind.ArrowFunction) && !expr.isKind(SyntaxKind.FunctionExpression)) {
    return [];
  }
  return expr.getParameters().map((p) => ({
    name: p.getName(),
    type: p.getType().getText(p),
  }));
}
function inferReturnType(expr) {
  if (expr.isKind(SyntaxKind.ArrowFunction) || expr.isKind(SyntaxKind.FunctionExpression)) {
    const retType = expr.getReturnType();
    return retType.getText(expr);
  }
  return 'unknown';
}
//# sourceMappingURL=service-analyzer.js.map
