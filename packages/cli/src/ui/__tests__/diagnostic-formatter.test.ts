import type { Diagnostic } from '@vertz/compiler';
import { describe, expect, it } from 'vitest';
import {
  formatDiagnostic,
  formatDiagnosticSummary,
  formatDiagnosticsAsGitHub,
  formatDiagnosticsAsJSON,
} from '../diagnostic-formatter';
import { symbols } from '../theme';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    code: 'VERTZ_ROUTE_MISSING_RESPONSE',
    message: 'Missing response schema',
    file: 'src/user.router.ts',
    line: 14,
    column: 1,
    ...overrides,
  };
}

describe('formatDiagnostic', () => {
  it('includes the error code and message', () => {
    const result = formatDiagnostic(makeDiagnostic());
    expect(result).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
    expect(result).toContain('Missing response schema');
  });

  it('includes the file location', () => {
    const result = formatDiagnostic(makeDiagnostic());
    expect(result).toContain('src/user.router.ts');
  });

  it('uses error symbol for error severity', () => {
    const result = formatDiagnostic(makeDiagnostic({ severity: 'error' }));
    expect(result).toContain(symbols.error);
  });

  it('uses warning symbol for warning severity', () => {
    const result = formatDiagnostic(makeDiagnostic({ severity: 'warning' }));
    expect(result).toContain(symbols.warning);
  });

  it('includes suggestion when present', () => {
    const result = formatDiagnostic(makeDiagnostic({ suggestion: 'Add a response property' }));
    expect(result).toContain('Add a response property');
  });

  it('renders source context lines', () => {
    const result = formatDiagnostic(
      makeDiagnostic({
        sourceContext: {
          lines: [
            { number: 14, text: '  handler: async (ctx) => {' },
            { number: 15, text: '    return ctx.userService.findById(ctx.params.id);' },
          ],
          highlightStart: 2,
          highlightLength: 7,
        },
      }),
    );
    expect(result).toContain('handler: async (ctx) => {');
    expect(result).toContain('^^^^^^^');
  });
});

describe('formatDiagnosticSummary', () => {
  it('shows no errors when empty', () => {
    const result = formatDiagnosticSummary([]);
    expect(result).toContain('No errors');
  });

  it('shows error count singular', () => {
    const result = formatDiagnosticSummary([makeDiagnostic()]);
    expect(result).toContain('1 error');
  });

  it('shows error count plural', () => {
    const result = formatDiagnosticSummary([makeDiagnostic(), makeDiagnostic()]);
    expect(result).toContain('2 errors');
  });

  it('shows warning count', () => {
    const result = formatDiagnosticSummary([
      makeDiagnostic({ severity: 'warning' }),
      makeDiagnostic({ severity: 'warning' }),
    ]);
    expect(result).toContain('2 warnings');
  });
});

describe('formatDiagnosticsAsJSON', () => {
  it('returns valid JSON', () => {
    const result = formatDiagnosticsAsJSON([makeDiagnostic()], false);
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('includes success field', () => {
    const result = JSON.parse(formatDiagnosticsAsJSON([], true));
    expect(result.success).toBe(true);
  });

  it('includes diagnostics array', () => {
    const result = JSON.parse(formatDiagnosticsAsJSON([makeDiagnostic()], false));
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('VERTZ_ROUTE_MISSING_RESPONSE');
  });
});

describe('formatDiagnosticsAsGitHub', () => {
  it('formats error as GitHub annotation', () => {
    const result = formatDiagnosticsAsGitHub([makeDiagnostic()]);
    expect(result).toContain('::error file=src/user.router.ts,line=14,col=1::');
  });

  it('formats warning as GitHub annotation', () => {
    const result = formatDiagnosticsAsGitHub([makeDiagnostic({ severity: 'warning' })]);
    expect(result).toContain('::warning file=');
  });
});
