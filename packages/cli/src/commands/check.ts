import type { Compiler, Diagnostic } from '@vertz/compiler';
import { ok, type Result } from '@vertz/errors';
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

export interface CheckData {
  diagnostics: Diagnostic[];
  output: string;
  hasErrors: boolean;
}

export async function checkAction(options: CheckOptions): Promise<Result<CheckData, Error>> {
  const { compiler, format } = options;

  const ir = await compiler.analyze();
  const diagnostics = await compiler.validate(ir);

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  let output: string;

  switch (format) {
    case 'json':
      output = formatDiagnosticsAsJSON(diagnostics, !hasErrors);
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

  return ok({ diagnostics, output, hasErrors });
}
