import type { Expression, ObjectLiteralExpression } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { InjectRef, ServiceIR, ServiceMethodIR, ServiceMethodParam } from '../ir/types';
import { extractObjectLiteral, findMethodCallsOnVariable, getProperties, getPropertyValue, getSourceLocation, getVariableNameForCall } from '../utils/ast-helpers';
import { BaseAnalyzer } from './base-analyzer';

export interface ServiceAnalyzerResult {
  services: ServiceIR[];
}

export class ServiceAnalyzer extends BaseAnalyzer<ServiceAnalyzerResult> {
  async analyze(): Promise<ServiceAnalyzerResult> {
    return { services: [] };
  }

  async analyzeForModule(
    moduleDefVarName: string,
    moduleName: string,
  ): Promise<ServiceIR[]> {
    const services: ServiceIR[] = [];

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

function parseInjectFromObj(obj: ObjectLiteralExpression): InjectRef[] {
  const injectExpr = getPropertyValue(obj, 'inject');
  if (!injectExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];
  return parseInjectRefs(injectExpr);
}

function parseMethodsFromObj(obj: ObjectLiteralExpression): ServiceMethodIR[] {
  const methodsExpr = getPropertyValue(obj, 'methods');
  if (!methodsExpr) return [];
  return extractMethodSignatures(methodsExpr);
}

export function parseInjectRefs(obj: ObjectLiteralExpression): InjectRef[] {
  return getProperties(obj).map(({ name, value }) => {
    const resolvedToken = value.isKind(SyntaxKind.Identifier) ? value.getText() : name;
    return { localName: name, resolvedToken };
  });
}

export function extractMethodSignatures(expr: Expression): ServiceMethodIR[] {
  if (!expr.isKind(SyntaxKind.ArrowFunction) && !expr.isKind(SyntaxKind.FunctionExpression)) {
    return [];
  }

  const body = expr.getBody();
  let returnObj: ObjectLiteralExpression | null = null;

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

  const methods: ServiceMethodIR[] = [];
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

function extractFunctionParams(expr: Expression): ServiceMethodParam[] {
  if (!expr.isKind(SyntaxKind.ArrowFunction) && !expr.isKind(SyntaxKind.FunctionExpression)) {
    return [];
  }
  return expr.getParameters().map((p) => ({
    name: p.getName(),
    type: p.getType().getText(p),
  }));
}

function inferReturnType(expr: Expression): string {
  if (expr.isKind(SyntaxKind.ArrowFunction) || expr.isKind(SyntaxKind.FunctionExpression)) {
    const retType = expr.getReturnType();
    return retType.getText(expr);
  }
  return 'unknown';
}
