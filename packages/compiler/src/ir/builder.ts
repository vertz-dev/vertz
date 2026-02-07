import type { Diagnostic } from '../errors';
import type { AppIR, DependencyGraphIR } from './types';

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
    dependencyGraph: createEmptyDependencyGraph(),
    diagnostics: [],
  };
}

export function addDiagnosticsToIR(ir: AppIR, diagnostics: readonly Diagnostic[]): AppIR {
  return {
    ...ir,
    diagnostics: [...ir.diagnostics, ...diagnostics],
  };
}
