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
import { BaseAnalyzer } from './base-analyzer';
import { createNamedSchemaRef } from './schema-analyzer';
export class EnvAnalyzer extends BaseAnalyzer {
  async analyze() {
    let env;
    for (const file of this.project.getSourceFiles()) {
      const calls = findCallExpressions(file, 'vertz', 'env');
      for (const call of calls) {
        const obj = extractObjectLiteral(call, 0);
        if (!obj) continue;
        const loc = getSourceLocation(call);
        if (env) {
          this.addDiagnostic(
            createDiagnosticFromLocation(loc, {
              severity: 'error',
              code: 'VERTZ_ENV_DUPLICATE',
              message: 'Multiple vertz.env() calls found. Only one is allowed.',
            }),
          );
          continue;
        }
        const loadExpr = getPropertyValue(obj, 'load');
        const loadFiles = loadExpr
          ? getArrayElements(loadExpr)
              .map((e) => getStringValue(e))
              .filter((v) => v !== null)
          : [];
        const schemaExpr = getPropertyValue(obj, 'schema');
        let schema;
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
//# sourceMappingURL=env-analyzer.js.map
