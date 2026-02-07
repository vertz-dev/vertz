import { describe, expect, it } from 'vitest';
import {
  createDiagnostic,
  createDiagnosticFromLocation,
  filterBySeverity,
  hasErrors,
  mergeDiagnostics,
} from '../errors';

describe('createDiagnostic', () => {
  it('returns a Diagnostic with all provided fields', () => {
    const result = createDiagnostic({
      severity: 'error',
      code: 'VERTZ_APP_MISSING',
      message: 'No vertz.app() found',
    });

    expect(result.severity).toBe('error');
    expect(result.code).toBe('VERTZ_APP_MISSING');
    expect(result.message).toBe('No vertz.app() found');
    expect(result.file).toBeUndefined();
    expect(result.line).toBeUndefined();
    expect(result.column).toBeUndefined();
  });

  it('includes optional fields when provided', () => {
    const result = createDiagnostic({
      severity: 'warning',
      code: 'VERTZ_SERVICE_UNUSED',
      message: 'Unused service',
      file: 'src/user.ts',
      line: 10,
      column: 3,
      suggestion: 'Remove or export the service',
    });

    expect(result.severity).toBe('warning');
    expect(result.code).toBe('VERTZ_SERVICE_UNUSED');
    expect(result.message).toBe('Unused service');
    expect(result.file).toBe('src/user.ts');
    expect(result.line).toBe(10);
    expect(result.column).toBe(3);
    expect(result.suggestion).toBe('Remove or export the service');
  });
});

describe('createDiagnosticFromLocation', () => {
  it('maps SourceLocation fields to Diagnostic', () => {
    const result = createDiagnosticFromLocation(
      { sourceFile: 'src/mod.ts', sourceLine: 5, sourceColumn: 1 },
      { severity: 'error', code: 'VERTZ_MODULE_CIRCULAR', message: 'Circular' },
    );

    expect(result.file).toBe('src/mod.ts');
    expect(result.line).toBe(5);
    expect(result.column).toBe(1);
    expect(result.severity).toBe('error');
    expect(result.code).toBe('VERTZ_MODULE_CIRCULAR');
    expect(result.message).toBe('Circular');
  });
});

describe('hasErrors', () => {
  it('returns false for empty array', () => {
    expect(hasErrors([])).toBe(false);
  });

  it('returns false for warnings-only array', () => {
    const diagnostics = [
      createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'unused' }),
    ];
    expect(hasErrors(diagnostics)).toBe(false);
  });

  it('returns true when at least one error exists', () => {
    const diagnostics = [
      createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'unused' }),
      createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'missing' }),
    ];
    expect(hasErrors(diagnostics)).toBe(true);
  });
});

describe('filterBySeverity', () => {
  it('returns only matching diagnostics', () => {
    const diagnostics = [
      createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'warn' }),
      createDiagnostic({ severity: 'info', code: 'VERTZ_DEAD_CODE', message: 'info' }),
    ];
    const result = filterBySeverity(diagnostics, 'warning');
    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe('warning');
  });
});

describe('mergeDiagnostics', () => {
  it('concatenates two arrays without mutating originals', () => {
    const a = [
      createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'a1' }),
      createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'a2' }),
    ];
    const b = [
      createDiagnostic({ severity: 'info', code: 'VERTZ_DEAD_CODE', message: 'b1' }),
      createDiagnostic({ severity: 'error', code: 'VERTZ_DEP_CYCLE', message: 'b2' }),
    ];
    const merged = mergeDiagnostics(a, b);
    expect(merged).toHaveLength(4);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });
});

describe('createDiagnostic sourceContext', () => {
  it('includes sourceContext when provided', () => {
    const result = createDiagnostic({
      severity: 'error',
      code: 'VERTZ_APP_MISSING',
      message: 'missing',
      sourceContext: {
        lines: [{ number: 10, text: 'const x = 1;' }],
        highlightStart: 6,
        highlightLength: 1,
      },
    });
    expect(result.sourceContext).toBeDefined();
    expect(result.sourceContext!.lines).toHaveLength(1);
    expect(result.sourceContext!.highlightStart).toBe(6);
    expect(result.sourceContext!.highlightLength).toBe(1);
  });
});
