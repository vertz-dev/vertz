import { SyntaxKind } from 'ts-morph';
import { createDiagnosticFromLocation } from '../errors';
import {
  extractObjectLiteral,
  findCallExpressions,
  getArrayElements,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
} from '../utils/ast-helpers';
import { resolveIdentifier } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';
export class AppAnalyzer extends BaseAnalyzer {
  async analyze() {
    const allAppCalls = [];
    for (const file of this.project.getSourceFiles()) {
      // Support both vertz.app() (deprecated) and vertz.server() (preferred)
      const appCalls = [
        ...findCallExpressions(file, 'vertz', 'app'),
        ...findCallExpressions(file, 'vertz', 'server'),
      ];
      for (const call of appCalls) {
        allAppCalls.push({ call, file });
      }
    }
    if (allAppCalls.length === 0) {
      this.addDiagnostic(
        createDiagnosticFromLocation(
          { sourceFile: '', sourceLine: 0, sourceColumn: 0 },
          {
            severity: 'error',
            code: 'VERTZ_APP_NOT_FOUND',
            message: 'No vertz.app() call found in the project.',
          },
        ),
      );
      return {
        app: {
          basePath: '/',
          globalMiddleware: [],
          moduleRegistrations: [],
          sourceFile: '',
          sourceLine: 0,
          sourceColumn: 0,
        },
      };
    }
    if (allAppCalls.length > 1) {
      const loc = getSourceLocation(allAppCalls[1].call);
      this.addDiagnostic(
        createDiagnosticFromLocation(loc, {
          severity: 'error',
          code: 'VERTZ_APP_DUPLICATE',
          message: 'Multiple vertz.app() calls found. Only one is allowed.',
        }),
      );
    }
    const { call, file } = allAppCalls[0];
    const obj = extractObjectLiteral(call, 0);
    const basePathExpr = obj ? getPropertyValue(obj, 'basePath') : null;
    const basePath = basePathExpr ? (getStringValue(basePathExpr) ?? '/') : '/';
    const versionExpr = obj ? getPropertyValue(obj, 'version') : null;
    const version = versionExpr ? (getStringValue(versionExpr) ?? undefined) : undefined;
    const loc = getSourceLocation(call);
    if (basePath !== '/' && !basePath.startsWith('/')) {
      this.addDiagnostic(
        createDiagnosticFromLocation(loc, {
          severity: 'warning',
          code: 'VERTZ_APP_BASEPATH_FORMAT',
          message: `basePath "${basePath}" should start with "/".`,
        }),
      );
    }
    const chainedCalls = this.collectChainedCalls(call);
    const globalMiddleware = this.extractMiddlewares(chainedCalls, file);
    const moduleRegistrations = this.extractRegistrations(chainedCalls);
    return {
      app: {
        basePath,
        version,
        globalMiddleware,
        moduleRegistrations,
        ...loc,
      },
    };
  }
  collectChainedCalls(appCall) {
    const results = [];
    let current = appCall;
    // Walk up the AST to find parent PropertyAccessExpression + CallExpression
    while (current.getParent()?.isKind(SyntaxKind.PropertyAccessExpression)) {
      const propAccess = current.getParentOrThrow();
      if (!propAccess.isKind(SyntaxKind.PropertyAccessExpression)) break;
      const methodName = propAccess.getName();
      const parentCall = propAccess.getParent();
      if (!parentCall?.isKind(SyntaxKind.CallExpression)) break;
      results.push({ methodName, call: parentCall });
      current = parentCall;
    }
    return results;
  }
  extractMiddlewares(chainedCalls, file) {
    const middleware = [];
    for (const { methodName, call } of chainedCalls) {
      if (methodName !== 'middlewares') continue;
      const arrArg = call.getArguments().at(0);
      if (!arrArg) continue;
      const elements = getArrayElements(arrArg);
      for (const el of elements) {
        if (el.isKind(SyntaxKind.Identifier)) {
          const resolved = resolveIdentifier(el, this.project);
          middleware.push({
            name: el.getText(),
            sourceFile: resolved ? resolved.sourceFile.getFilePath() : file.getFilePath(),
          });
        }
      }
    }
    return middleware;
  }
  extractRegistrations(chainedCalls) {
    const registrations = [];
    for (const { methodName, call } of chainedCalls) {
      if (methodName !== 'register') continue;
      const args = call.getArguments();
      const moduleArg = args.at(0);
      if (!moduleArg) continue;
      const moduleName = moduleArg.isKind(SyntaxKind.Identifier) ? moduleArg.getText() : undefined;
      if (!moduleName) {
        this.addDiagnostic(
          createDiagnosticFromLocation(getSourceLocation(call), {
            severity: 'warning',
            code: 'VERTZ_APP_INLINE_MODULE',
            message:
              '.register() argument should be a module identifier, not an inline expression.',
          }),
        );
        continue;
      }
      const optionsObj = extractObjectLiteral(call, 1);
      const options = optionsObj ? this.extractOptions(optionsObj) : undefined;
      registrations.push({ moduleName, options });
    }
    return registrations;
  }
  extractOptions(obj) {
    const result = {};
    for (const prop of obj.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
      const name = prop.getName();
      const init = prop.getInitializerOrThrow();
      const strValue = getStringValue(init);
      if (strValue !== null) {
        result[name] = strValue;
      } else if (init.isKind(SyntaxKind.TrueKeyword)) {
        result[name] = true;
      } else if (init.isKind(SyntaxKind.FalseKeyword)) {
        result[name] = false;
      } else if (init.isKind(SyntaxKind.NumericLiteral)) {
        result[name] = Number(init.getText());
      } else if (init.isKind(SyntaxKind.ObjectLiteralExpression)) {
        result[name] = this.extractOptions(init);
      }
    }
    return result;
  }
}
//# sourceMappingURL=app-analyzer.js.map
