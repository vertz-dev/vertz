import type { CallExpression, Expression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type {
  EntityAccessRuleKind,
  HttpMethod,
  InjectRef,
  ServiceActionIR,
  ServiceIR,
  ServiceMethodIR,
  ServiceMethodParam,
} from '../ir/types';
import {
  extractObjectLiteral,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
} from '../utils/ast-helpers';
import { isFromImport } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

export interface ServiceAnalyzerResult {
  services: ServiceIR[];
}

export class ServiceAnalyzer extends BaseAnalyzer<ServiceAnalyzerResult> {
  async analyze(): Promise<ServiceAnalyzerResult> {
    const services: ServiceIR[] = [];

    for (const file of this.project.getSourceFiles()) {
      const calls = this.findServiceCalls(file);
      for (const call of calls) {
        const svc = this.extractService(call);
        if (svc) services.push(svc);
      }
    }

    return { services };
  }

  private findServiceCalls(file: SourceFile): CallExpression[] {
    const validCalls: CallExpression[] = [];

    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();

      if (expr.isKind(SyntaxKind.Identifier) && expr.getText() === 'service') {
        if (isFromImport(expr, '@vertz/server')) {
          validCalls.push(call);
        }
      }
    }

    return validCalls;
  }

  private extractService(call: CallExpression): ServiceIR | null {
    const args = call.getArguments();
    if (args.length < 2) return null;

    const name = getStringValue(args[0] as Expression);
    if (!name) return null;

    const configArg = args[1];
    if (!configArg?.isKind(SyntaxKind.ObjectLiteralExpression)) return null;

    const loc = getSourceLocation(call);
    const actions = this.parseActions(configArg);
    const access = this.parseAccess(configArg, actions);
    const inject = parseInjectFromObj(configArg);

    return {
      name,
      ...loc,
      inject,
      actions,
      access,
    };
  }

  private parseActions(config: ObjectLiteralExpression): ServiceActionIR[] {
    const actionsExpr = getPropertyValue(config, 'actions');
    if (!actionsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

    const actions: ServiceActionIR[] = [];

    for (const prop of getProperties(actionsExpr)) {
      const actionName = prop.name;
      const init = prop.value;

      // Expect action() call
      if (!init.isKind(SyntaxKind.CallExpression)) continue;
      const callee = init.getExpression();
      if (!callee.isKind(SyntaxKind.Identifier) || callee.getText() !== 'action') continue;

      const actionConfig = extractObjectLiteral(init, 0);
      if (!actionConfig) continue;

      const methodExpr = getPropertyValue(actionConfig, 'method');
      const method: HttpMethod = methodExpr
        ? ((getStringValue(methodExpr) as HttpMethod) ?? 'POST')
        : 'POST';

      const pathExpr = getPropertyValue(actionConfig, 'path');
      const path = pathExpr ? (getStringValue(pathExpr) ?? undefined) : undefined;

      actions.push({ name: actionName, method, path });
    }

    return actions;
  }

  private parseAccess(
    config: ObjectLiteralExpression,
    actions: ServiceActionIR[],
  ): Record<string, EntityAccessRuleKind> {
    const access: Record<string, EntityAccessRuleKind> = {};
    const accessExpr = getPropertyValue(config, 'access');

    if (!accessExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
      // No access property — mark all actions as 'none'
      for (const a of actions) {
        access[a.name] = 'none';
      }
      return access;
    }

    const accessProps = new Map<string, Expression>();
    for (const prop of getProperties(accessExpr)) {
      accessProps.set(prop.name, prop.value);
    }

    for (const a of actions) {
      const rule = accessProps.get(a.name);
      if (!rule) {
        access[a.name] = 'none';
      } else if (
        rule.isKind(SyntaxKind.FalseKeyword) ||
        (rule.isKind(SyntaxKind.Identifier) && rule.getText() === 'false')
      ) {
        access[a.name] = 'false';
      } else {
        access[a.name] = 'function';
      }
    }

    return access;
  }
}

function parseInjectFromObj(obj: ObjectLiteralExpression): InjectRef[] {
  const injectExpr = getPropertyValue(obj, 'inject');
  if (!injectExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];
  return parseInjectRefs(injectExpr);
}

export function parseInjectRefs(obj: ObjectLiteralExpression): InjectRef[] {
  return getProperties(obj).map(({ name, value }) => {
    const resolvedToken = value.isKind(SyntaxKind.Identifier) ? value.getText() : name;
    return { localName: name, resolvedToken };
  });
}

/** @deprecated Use ServiceActionIR-based analysis instead */
export function extractMethodSignatures(expr: Expression): ServiceMethodIR[] {
  if (!expr.isKind(SyntaxKind.ArrowFunction) && !expr.isKind(SyntaxKind.FunctionExpression)) {
    return [];
  }

  const body = expr.getBody();
  let returnObj: ObjectLiteralExpression | null = null;

  if (body.isKind(SyntaxKind.ObjectLiteralExpression)) {
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
