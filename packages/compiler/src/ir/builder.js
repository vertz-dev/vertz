export function createEmptyDependencyGraph() {
  return {
    nodes: [],
    edges: [],
    initializationOrder: [],
    circularDependencies: [],
  };
}
export function createEmptyAppIR() {
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
export function enrichSchemasWithModuleNames(ir) {
  const schemaToModule = new Map();
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
  const schemas = ir.schemas.map((s) => ({
    ...s,
    moduleName: schemaToModule.get(s.name) ?? s.moduleName,
  }));
  return { ...ir, schemas };
}
export function addDiagnosticsToIR(ir, diagnostics) {
  return {
    ...ir,
    diagnostics: [...ir.diagnostics, ...diagnostics],
  };
}
//# sourceMappingURL=builder.js.map
