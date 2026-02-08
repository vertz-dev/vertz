import type { Compiler, Diagnostic } from '@vertz/compiler';
import { formatDiagnostic, formatDiagnosticSummary } from '../ui/diagnostic-formatter';
import { formatDuration } from '../utils/format';

export interface BuildOptions {
  compiler: Compiler;
  noEmit?: boolean;
}

export interface BuildResult {
  success: boolean;
  diagnostics: Diagnostic[];
  output: string;
  durationMs: number;
}

export async function buildAction(options: BuildOptions): Promise<BuildResult> {
  const { compiler, noEmit = false } = options;
  const start = performance.now();

  let diagnostics: Diagnostic[];
  let success: boolean;

  if (noEmit) {
    const ir = await compiler.analyze();
    diagnostics = await compiler.validate(ir);
    success = !diagnostics.some((d) => d.severity === 'error');
  } else {
    const result = await compiler.compile();
    diagnostics = result.diagnostics;
    success = result.success;
  }

  const durationMs = performance.now() - start;
  const parts: string[] = [];

  if (success) {
    parts.push(`Built successfully in ${formatDuration(durationMs)}`);
  } else {
    for (const d of diagnostics) {
      parts.push(formatDiagnostic(d));
    }
    parts.push('');
    parts.push(formatDiagnosticSummary(diagnostics));
    parts.push('');
    const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
    parts.push(`Build failed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`);
  }

  return {
    success,
    diagnostics,
    output: parts.join('\n'),
    durationMs,
  };
}
