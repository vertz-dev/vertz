import {
  formatDiagnostic,
  formatDiagnosticSummary,
  formatDiagnosticsAsGitHub,
  formatDiagnosticsAsJSON,
} from '../ui/diagnostic-formatter';
export async function checkAction(options) {
  const { compiler, format } = options;
  const ir = await compiler.analyze();
  const diagnostics = await compiler.validate(ir);
  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  const success = !hasErrors;
  let output;
  switch (format) {
    case 'json':
      output = formatDiagnosticsAsJSON(diagnostics, success);
      break;
    case 'github':
      output = formatDiagnosticsAsGitHub(diagnostics);
      break;
    default: {
      const parts = [];
      for (const d of diagnostics) {
        parts.push(formatDiagnostic(d));
      }
      parts.push('');
      parts.push(formatDiagnosticSummary(diagnostics));
      output = parts.join('\n');
      break;
    }
  }
  return { success, diagnostics, output };
}
//# sourceMappingURL=check.js.map
