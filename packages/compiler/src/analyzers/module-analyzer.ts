import type { Expression, ObjectLiteralExpression, Project } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { ResolvedConfig } from '../config';
import { createDiagnosticFromLocation } from '../errors';
import type { ImportRef, ModuleIR, SchemaRef } from '../ir/types';
import { createNamedSchemaRef } from './schema-analyzer';
import { extractObjectLiteral, findCallExpressions, getProperties, getPropertyValue, getSourceLocation, getStringValue, getVariableNameForCall } from '../utils/ast-helpers';
import { BaseAnalyzer } from './base-analyzer';
import type { ServiceAnalyzer } from './service-analyzer';

export interface ModuleAnalyzerResult {
  modules: ModuleIR[];
}

export class ModuleAnalyzer extends BaseAnalyzer<ModuleAnalyzerResult> {
  constructor(project: Project, config: ResolvedConfig, _serviceAnalyzer: ServiceAnalyzer) {
    super(project, config);
  }

  async analyze(): Promise<ModuleAnalyzerResult> {
    const modules: ModuleIR[] = [];
    // Map from moduleDef variable name to module index
    const defVarToIndex = new Map<string, number>();

    // Pass 1: find vertz.moduleDef() calls
    for (const file of this.project.getSourceFiles()) {
      const defCalls = findCallExpressions(file, 'vertz', 'moduleDef');
      for (const call of defCalls) {
        const obj = extractObjectLiteral(call, 0);
        if (!obj) continue;

        const nameExpr = getPropertyValue(obj, 'name');
        const name = nameExpr ? getStringValue(nameExpr) : null;
        if (!name) {
          this.addDiagnostic(createDiagnosticFromLocation(getSourceLocation(call), {
            severity: 'error',
            code: 'VERTZ_MODULE_DYNAMIC_NAME',
            message: 'vertz.moduleDef() requires a static string `name` property.',
          }));
          continue;
        }

        const varName = getVariableNameForCall(call);

        const importsExpr = getPropertyValue(obj, 'imports');
        const imports = importsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)
          ? parseImports(importsExpr)
          : [];

        const optionsExpr = getPropertyValue(obj, 'options');
        let options: SchemaRef | undefined;
        if (optionsExpr?.isKind(SyntaxKind.Identifier)) {
          options = createNamedSchemaRef(optionsExpr.getText(), file.getFilePath());
        }

        const loc = getSourceLocation(call);
        const idx = modules.length;

        modules.push({
          name,
          ...loc,
          imports,
          options,
          services: [],
          routers: [],
          exports: [],
        });

        if (varName) {
          defVarToIndex.set(varName, idx);
        }
      }
    }

    // Pass 2: find vertz.module() calls and link to moduleDef
    for (const file of this.project.getSourceFiles()) {
      const moduleCalls = findCallExpressions(file, 'vertz', 'module');
      for (const call of moduleCalls) {
        const args = call.getArguments();
        if (args.length < 2) continue;

        const defArg = args[0]!;
        if (!defArg.isKind(SyntaxKind.Identifier)) continue;
        const defVarName = defArg.getText();

        const idx = defVarToIndex.get(defVarName);
        if (idx === undefined) continue;

        const assemblyObj = extractObjectLiteral(call, 1);
        if (!assemblyObj) continue;

        const exportsExpr = getPropertyValue(assemblyObj, 'exports');
        if (exportsExpr) {
          modules[idx]!.exports = extractIdentifierNames(exportsExpr);
        }

        const servicesExpr = getPropertyValue(assemblyObj, 'services');
        if (servicesExpr) {
          // Store service variable names temporarily — they'll be resolved to ServiceIR by Phase 7
          const serviceNames = extractIdentifierNames(servicesExpr);
          // For now, leave services as [] — will be populated when ServiceAnalyzer is integrated
          void serviceNames;
        }

        const routersExpr = getPropertyValue(assemblyObj, 'routers');
        if (routersExpr) {
          const routerNames = extractIdentifierNames(routersExpr);
          void routerNames;
        }
      }
    }

    return { modules };
  }
}

export function parseImports(obj: ObjectLiteralExpression): ImportRef[] {
  return getProperties(obj).map(({ name }) => ({
    localName: name,
    isEnvImport: false,
  }));
}

export function extractIdentifierNames(expr: Expression): string[] {
  if (!expr.isKind(SyntaxKind.ArrayLiteralExpression)) return [];
  return expr.getElements()
    .filter((e): e is import('ts-morph').Identifier => e.isKind(SyntaxKind.Identifier))
    .map((e) => e.getText());
}
