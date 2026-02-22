import type { Diagnostic } from '@vertz/compiler';
import { symbols } from '@vertz/tui';
import { describe, expect, it } from 'vitest';
import { DiagnosticDisplay } from '../../components/DiagnosticDisplay';
import type { ReactElement } from 'react';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    code: 'VERTZ_ROUTE_MISSING_RESPONSE',
    message: 'Route must have a response schema',
    file: 'src/user.router.ts',
    line: 14,
    column: 3,
    ...overrides,
  };
}

// Helper to extract all text strings from a React element tree
function extractText(el: any): string {
  if (typeof el === 'string' || typeof el === 'number') {
    return String(el);
  }
  if (!el) return '';
  if (Array.isArray(el)) {
    return el.map(extractText).join('');
  }
  if (el.props && el.props.children) {
    return extractText(el.props.children);
  }
  return '';
}

describe('DiagnosticDisplay', () => {
  it('renders the diagnostic error code', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic() }) as ReactElement;
    expect(extractText(el)).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
  });

  it('renders the diagnostic message', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic() }) as ReactElement;
    expect(extractText(el)).toContain('Route must have a response schema');
  });

  it('renders the file path with line and column', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic() }) as ReactElement;
    expect(extractText(el)).toContain('src/user.router.ts:14:3');
  });

  it('renders error symbol for error severity', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic({ severity: 'error' }) }) as ReactElement;
    expect(extractText(el)).toContain(symbols.error);
  });

  it('renders warning symbol for warning severity', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic({ severity: 'warning' }) }) as ReactElement;
    expect(extractText(el)).toContain(symbols.warning);
  });

  it('renders suggestion when present', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic({ suggestion: 'Add a response property' }) }) as ReactElement;
    expect(extractText(el)).toContain('Add a response property');
  });

  it('renders code frame with line numbers', () => {
    const el = DiagnosticDisplay({
      diagnostic: makeDiagnostic({
        sourceContext: {
          lines: [
            { number: 14, text: '  .get("/users/:id", {' },
            { number: 15, text: '    handler: async (ctx) => {' },
          ],
          highlightStart: 2,
          highlightLength: 7,
        },
      }),
    }) as ReactElement;
    const text = extractText(el);
    expect(text).toContain('14');
    expect(text).toContain('.get("/users/:id"');
  });

  it('handles diagnostics without sourceContext', () => {
    const el = DiagnosticDisplay({ diagnostic: makeDiagnostic({ sourceContext: undefined }) }) as ReactElement;
    expect(extractText(el)).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
  });
});
