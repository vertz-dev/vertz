import type { Diagnostic } from '@vertz/compiler';
import { symbols } from './theme';

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const icon = diagnostic.severity === 'error' ? symbols.error : symbols.warning;

  const lines: string[] = [];

  const location = diagnostic.file
    ? `${diagnostic.file}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}`
    : '';

  lines.push(`${icon} ${diagnostic.code}: ${diagnostic.message}`);

  if (location) {
    lines.push(`  at ${location}`);
  }

  if (diagnostic.sourceContext) {
    const ctx = diagnostic.sourceContext;
    for (const line of ctx.lines) {
      lines.push(`  ${String(line.number).padStart(4)} ${line.text}`);
    }
    if (ctx.highlightStart >= 0 && ctx.highlightLength > 0) {
      const padding = ' '.repeat(ctx.highlightStart + 6);
      const underline = '^'.repeat(ctx.highlightLength);
      lines.push(`${padding}${underline}`);
    }
  }

  if (diagnostic.suggestion) {
    lines.push(`  ${symbols.info} ${diagnostic.suggestion}`);
  }

  return lines.join('\n');
}

export function formatDiagnosticSummary(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const parts: string[] = [];

  if (errors.length === 0 && warnings.length === 0) {
    return `${symbols.success} No errors`;
  }

  if (errors.length > 0) {
    parts.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`);
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

export function formatDiagnosticsAsJSON(
  diagnostics: readonly Diagnostic[],
  success: boolean,
): string {
  return JSON.stringify({
    success,
    diagnostics: diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      file: d.file,
      line: d.line,
      column: d.column,
      suggestion: d.suggestion,
    })),
  });
}

export function formatDiagnosticsAsGitHub(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const level = d.severity === 'error' ? 'error' : 'warning';
      const file = d.file ?? '';
      const line = d.line ?? 0;
      const col = d.column ?? 0;
      return `::${level} file=${file},line=${line},col=${col}::${d.code}: ${d.message}`;
    })
    .join('\n');
}
