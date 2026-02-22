import type { Diagnostic } from '@vertz/compiler';
import { symbols } from '@vertz/tui';
import { describe, expect, it } from 'vitest';
import { DiagnosticSummary } from '../../components/DiagnosticSummary';

function makeDiagnostic(severity: 'error' | 'warning'): Diagnostic {
  return {
    severity,
    code: 'VERTZ_DEAD_CODE',
    message: 'test',
  };
}

describe('DiagnosticSummary', () => {
  it('renders no errors when empty', () => {
    const el = DiagnosticSummary({ diagnostics: [] }) as any;
    expect(el.props.children).toEqual([symbols.success, ' No errors']);
  });

  it('renders singular error count', () => {
    const el = DiagnosticSummary({ diagnostics: [makeDiagnostic('error')] }) as any;
    const parts = el.props.children;
    expect(parts[0].props.children).toEqual([1, ' error', '']);
  });

  it('renders plural error count', () => {
    const el = DiagnosticSummary({
      diagnostics: [makeDiagnostic('error'), makeDiagnostic('error'), makeDiagnostic('error')],
    }) as any;
    const parts = el.props.children;
    expect(parts[0].props.children).toEqual([3, ' error', 's']);
  });

  it('renders warning count', () => {
    const el = DiagnosticSummary({
      diagnostics: [makeDiagnostic('warning'), makeDiagnostic('warning')],
    }) as any;
    const parts = el.props.children;
    expect(parts[0].props.children).toEqual([2, ' warning', 's']);
  });

  it('renders both errors and warnings', () => {
    const el = DiagnosticSummary({
      diagnostics: [makeDiagnostic('error'), makeDiagnostic('warning')],
    }) as any;
    const parts = el.props.children;
    expect(parts[0].props.children).toEqual([1, ' error', '']);
    expect(parts[1].props.children).toBe(', ');
    expect(parts[2].props.children).toEqual([1, ' warning', '']);
  });
});
