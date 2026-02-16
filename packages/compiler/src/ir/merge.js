function mergeByName(base, partial) {
  if (!partial) return base;
  const partialNames = new Set(partial.map((item) => item.name));
  const preserved = base.filter((item) => !partialNames.has(item.name));
  return [...preserved, ...partial];
}
export function mergeIR(base, partial) {
  return {
    ...base,
    modules: mergeByName(base.modules, partial.modules),
    schemas: mergeByName(base.schemas, partial.schemas),
    middleware: mergeByName(base.middleware, partial.middleware),
    dependencyGraph: partial.dependencyGraph ?? base.dependencyGraph,
    diagnostics: [],
  };
}
//# sourceMappingURL=merge.js.map
