import type { Diagnostic } from '@vertz/compiler';
import { colors, symbols } from './theme';

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const icon = diagnostic.severity === 'error' ? symbols.error : symbols.warning;
  const color = diagnostic.severity === 'error' ? colors.error : colors.warning;

  const lines: string[] = [];

  const location = diagnostic.file
    ? `${diagnostic.file}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}`
    : '';

  lines.push(
    `${color}${icon}${colors.reset} ${colors.bold}${diagnostic.code}${colors.reset}: ${diagnostic.message}`,
  );

  if (location) {
    lines.push(`  ${colors.dim}at ${location}${colors.reset}`);
  }

  if (diagnostic.sourceContext) {
    const ctx = diagnostic.sourceContext;
    for (const line of ctx.lines) {
      lines.push(`  ${colors.dim}${String(line.number).padStart(4)}${colors.reset} ${line.text}`);
    }
    if (ctx.highlightStart >= 0 && ctx.highlightLength > 0) {
      const padding = ' '.repeat(ctx.highlightStart + 6);
      const underline = '^'.repeat(ctx.highlightLength);
      lines.push(`${padding}${color}${underline}${colors.reset}`);
    }
  }

  if (diagnostic.suggestion) {
    lines.push(`  ${colors.info}${symbols.info} ${diagnostic.suggestion}${colors.reset}`);
  }

  return lines.join('\n');
}

export function formatDiagnosticSummary(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const parts: string[] = [];

  if (errors.length === 0 && warnings.length === 0) {
    return `${colors.success}${symbols.success} No errors${colors.reset}`;
  }

  if (errors.length > 0) {
    parts.push(
      `${colors.error}${errors.length} error${errors.length === 1 ? '' : 's'}${colors.reset}`,
    );
  }

  if (warnings.length > 0) {
    parts.push(
      `${colors.warning}${warnings.length} warning${warnings.length === 1 ? '' : 's'}${colors.reset}`,
    );
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
