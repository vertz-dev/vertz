import { SyntaxKind } from 'ts-morph';
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

        // auth is configured — check which features are enabled
        const features: AuthFeature[] = [];

        if (authProp.isKind(SyntaxKind.ObjectLiteralExpression)) {
          for (const key of AUTH_FEATURE_KEYS) {
            if (getPropertyValue(authProp, key)) {
              features.push(key);
            }
          }
        }

        return { auth: { features } };
      }
    }

    return { auth: undefined };
  }
}
