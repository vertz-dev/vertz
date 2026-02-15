import type { Diagnostic } from '@vertz/compiler';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { DiagnosticSummary } from '../../components/DiagnosticSummary';
import { symbols } from '@vertz/tui';

function makeDiagnostic(severity: 'error' | 'warning'): Diagnostic {
  return {
    severity,
    code: 'VERTZ_DEAD_CODE',
    message: 'test',
  };
}

describe('DiagnosticSummary', () => {
  it('renders no errors when empty', () => {
    const { lastFrame } = render(<DiagnosticSummary diagnostics={[]} />);
    expect(lastFrame()).toContain('No errors');
    expect(lastFrame()).toContain(symbols.success);
  });

  it('renders singular error count', () => {
    const { lastFrame } = render(<DiagnosticSummary diagnostics={[makeDiagnostic('error')]} />);
    expect(lastFrame()).toContain('1 error');
  });

  it('renders plural error count', () => {
    const { lastFrame } = render(
      <DiagnosticSummary
        diagnostics={[makeDiagnostic('error'), makeDiagnostic('error'), makeDiagnostic('error')]}
      />,
    );
    expect(lastFrame()).toContain('3 errors');
  });

  it('renders warning count', () => {
    const { lastFrame } = render(
      <DiagnosticSummary diagnostics={[makeDiagnostic('warning'), makeDiagnostic('warning')]} />,
    );
    expect(lastFrame()).toContain('2 warnings');
  });

  it('renders both errors and warnings', () => {
    const { lastFrame } = render(
      <DiagnosticSummary diagnostics={[makeDiagnostic('error'), makeDiagnostic('warning')]} />,
    );
    expect(lastFrame()).toContain('1 error');
    expect(lastFrame()).toContain('1 warning');
  });
});
