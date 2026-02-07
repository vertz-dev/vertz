import { SyntaxKind } from 'ts-morph';
import type { EnvIR, SchemaRef } from '../ir/types';
import { createDiagnosticFromLocation } from '../errors';
import { extractObjectLiteral, findCallExpressions, getArrayElements, getPropertyValue, getSourceLocation, getStringValue } from '../utils/ast-helpers';
import { createNamedSchemaRef } from './schema-analyzer';
import { BaseAnalyzer } from './base-analyzer';

export interface EnvAnalyzerResult {
  env: EnvIR | undefined;
}

export class EnvAnalyzer extends BaseAnalyzer<EnvAnalyzerResult> {
  async analyze(): Promise<EnvAnalyzerResult> {
    let env: EnvIR | undefined;

    for (const file of this.project.getSourceFiles()) {
      const calls = findCallExpressions(file, 'vertz', 'env');
      for (const call of calls) {
        const obj = extractObjectLiteral(call, 0);
        if (!obj) continue;

        const loc = getSourceLocation(call);

        if (env) {
          this.addDiagnostic(createDiagnosticFromLocation(loc, {
            severity: 'error',
            code: 'VERTZ_ENV_DUPLICATE',
            message: 'Multiple vertz.env() calls found. Only one is allowed.',
          }));
          continue;
        }

        const loadExpr = getPropertyValue(obj, 'load');
        const loadFiles = loadExpr
          ? getArrayElements(loadExpr).map((e) => getStringValue(e)).filter((v): v is string => v !== null)
          : [];

        const schemaExpr = getPropertyValue(obj, 'schema');
        let schema: SchemaRef | undefined;
        if (schemaExpr?.isKind(SyntaxKind.Identifier)) {
          schema = createNamedSchemaRef(schemaExpr.getText(), file.getFilePath());
        }

        env = {
          ...loc,
          loadFiles,
          schema,
          variables: [],
        };
      }
    }
    return { env };
  }
}
