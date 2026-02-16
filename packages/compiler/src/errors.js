export function createDiagnostic(options) {
  return { ...options };
}
export function createDiagnosticFromLocation(location, options) {
  return {
    ...options,
    file: location.sourceFile,
    line: location.sourceLine,
    column: location.sourceColumn,
  };
}
export function hasErrors(diagnostics) {
  return diagnostics.some((d) => d.severity === 'error');
}
export function filterBySeverity(diagnostics, severity) {
  return diagnostics.filter((d) => d.severity === severity);
}
export function mergeDiagnostics(a, b) {
  return [...a, ...b];
}
//# sourceMappingURL=errors.js.map
