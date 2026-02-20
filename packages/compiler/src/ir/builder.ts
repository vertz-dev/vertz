import type { Diagnostic } from '../errors';
import type { AppIR, DependencyGraphIR, SchemaIR } from './types';

export function createEmptyDependencyGraph(): DependencyGraphIR {
  return {
    nodes: [],
    edges: [],
    initializationOrder: [],
    circularDependencies: [],
  };
}

export function createEmptyAppIR(): AppIR {
  return {
    app: {
      basePath: '',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: '',
      sourceLine: 0,
      sourceColumn: 0,
    },
    modules: [],
    middleware: [],
    schemas: [],
    entities: [],
    dependencyGraph: createEmptyDependencyGraph(),
    diagnostics: [],
  };
}

export function enrichSchemasWithModuleNames(ir: AppIR): AppIR {
  const schemaToModule = new Map<string, string>();

  for (const mod of ir.modules) {
    for (const router of mod.routers) {
      for (const route of router.routes) {
        const refs = [route.body, route.query, route.params, route.headers, route.response];
        for (const ref of refs) {
          if (ref?.kind === 'named') {
            schemaToModule.set(ref.schemaName, mod.name);
          }
        }
      }
    }
  }

  const schemas: SchemaIR[] = ir.schemas.map((s) => ({
    ...s,
    moduleName: schemaToModule.get(s.name) ?? s.moduleName,
  }));

  return { ...ir, schemas };
}

export function addDiagnosticsToIR(ir: AppIR, diagnostics: readonly Diagnostic[]): AppIR {
  return {
    ...ir,
    diagnostics: [...ir.diagnostics, ...diagnostics],
  };
}
