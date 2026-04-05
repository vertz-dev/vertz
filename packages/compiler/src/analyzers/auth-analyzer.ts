import { type Expression, type ObjectLiteralExpression, type Project, SyntaxKind } from 'ts-morph';
import type { AuthFeature, AuthIR } from '../ir/types';
import { extractObjectLiteral, getPropertyValue } from '../utils/ast-helpers';
import { BaseAnalyzer } from './base-analyzer';

export interface AuthAnalyzerResult {
  auth?: AuthIR;
}

const AUTH_FEATURE_KEYS: AuthFeature[] = [
  'emailPassword',
  'tenant',
  'providers',
  'mfa',
  'emailVerification',
  'passwordReset',
];

/**
 * Resolve an expression to an ObjectLiteralExpression by following identifiers
 * to their variable declarations and unwrapping wrapper calls like defineAuth().
 */
function resolveToObjectLiteral(node: Expression): ObjectLiteralExpression | null {
  if (node.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return node;
  }

  if (node.isKind(SyntaxKind.Identifier)) {
    for (const def of node.getDefinitionNodes()) {
      if (def.isKind(SyntaxKind.VariableDeclaration)) {
        const init = def.getInitializer();
        if (init) return resolveToObjectLiteral(init);
      }
      // Follow imports to the source module's variable declaration
      if (def.isKind(SyntaxKind.ImportSpecifier)) {
        const aliased = def.getSymbol()?.getAliasedSymbol();
        if (!aliased) continue;
        for (const decl of aliased.getDeclarations()) {
          if (decl.isKind(SyntaxKind.VariableDeclaration)) {
            const init = decl.getInitializer();
            if (init) return resolveToObjectLiteral(init);
          }
        }
      }
    }
    return null;
  }

  // Unwrap function calls like defineAuth({...}) — extract first argument
  if (node.isKind(SyntaxKind.CallExpression)) {
    const firstArg = node.getArguments()[0] as Expression | undefined;
    if (firstArg) return resolveToObjectLiteral(firstArg);
    return null;
  }

  return null;
}

function extractFeaturesFromObject(authObj: ObjectLiteralExpression): AuthFeature[] {
  const features: AuthFeature[] = [];
  for (const key of AUTH_FEATURE_KEYS) {
    if (getPropertyValue(authObj, key)) {
      features.push(key);
    }
  }
  return features;
}

/**
 * Fallback: scan all project files for defineAuth() calls and extract features
 * from the first one found. Used when the auth identifier in createServer()
 * can't be resolved (e.g., unresolvable external imports).
 */
function scanForDefineAuth(project: Project): AuthFeature[] {
  for (const file of project.getSourceFiles()) {
    const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
      const expr = call.getExpression();
      return expr.isKind(SyntaxKind.Identifier) && expr.getText() === 'defineAuth';
    });

    for (const call of calls) {
      const firstArg = call.getArguments()[0] as Expression | undefined;
      if (!firstArg) continue;
      const obj = resolveToObjectLiteral(firstArg);
      if (obj) return extractFeaturesFromObject(obj);
    }
  }
  return [];
}

export class AuthAnalyzer extends BaseAnalyzer<AuthAnalyzerResult> {
  async analyze(): Promise<AuthAnalyzerResult> {
    for (const file of this.project.getSourceFiles()) {
      // Find createServer() calls — standalone function (not obj.method pattern)
      const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
        const expr = call.getExpression();
        return expr.isKind(SyntaxKind.Identifier) && expr.getText() === 'createServer';
      });

      for (const call of calls) {
        const configObj = extractObjectLiteral(call, 0);
        if (!configObj) continue;

        const authProp = getPropertyValue(configObj, 'auth');
        if (!authProp) continue;

        // auth is configured — resolve the object literal to extract features
        const authObj = resolveToObjectLiteral(authProp);
        if (authObj) {
          return { auth: { features: extractFeaturesFromObject(authObj) } };
        }

        // Fallback: identifier couldn't be resolved (e.g., unresolvable imports).
        // Scan all files for defineAuth() calls.
        const fallbackFeatures = scanForDefineAuth(this.project);
        return { auth: { features: fallbackFeatures } };
      }
    }

    return { auth: undefined };
  }
}
