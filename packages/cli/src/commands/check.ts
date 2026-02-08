import type { Compiler, Diagnostic } from '@vertz/compiler';
import {
  formatDiagnostic,
  formatDiagnosticSummary,
  formatDiagnosticsAsGitHub,
  formatDiagnosticsAsJSON,
} from '../ui/diagnostic-formatter';

export interface CheckOptions {
  compiler: Compiler;
  format: 'text' | 'json' | 'github';
}

export interface CheckResult {
  success: boolean;
  diagnostics: Diagnostic[];
  output: string;
}

export async function checkAction(options: CheckOptions): Promise<CheckResult> {
  const { compiler, format } = options;

  const ir = await compiler.analyze();
  const diagnostics = await compiler.validate(ir);

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  const success = !hasErrors;

  let output: string;

  switch (format) {
    case 'json':
      output = formatDiagnosticsAsJSON(diagnostics, success);
      break;
    case 'github':
      output = formatDiagnosticsAsGitHub(diagnostics);
      break;
    default: {
      const parts: string[] = [];
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
