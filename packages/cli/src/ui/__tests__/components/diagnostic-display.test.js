import { symbols } from '@vertz/tui';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { DiagnosticDisplay } from '../../components/DiagnosticDisplay';

function makeDiagnostic(overrides = {}) {
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
describe('DiagnosticDisplay', () => {
  it('renders the diagnostic error code', () => {
    const { lastFrame } = render(<DiagnosticDisplay diagnostic={makeDiagnostic()} />);
    expect(lastFrame()).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
  });
  it('renders the diagnostic message', () => {
    const { lastFrame } = render(<DiagnosticDisplay diagnostic={makeDiagnostic()} />);
    expect(lastFrame()).toContain('Route must have a response schema');
  });
  it('renders the file path with line and column', () => {
    const { lastFrame } = render(<DiagnosticDisplay diagnostic={makeDiagnostic()} />);
    expect(lastFrame()).toContain('src/user.router.ts:14:3');
  });
  it('renders error symbol for error severity', () => {
    const { lastFrame } = render(
      <DiagnosticDisplay diagnostic={makeDiagnostic({ severity: 'error' })} />,
    );
    expect(lastFrame()).toContain(symbols.error);
  });
  it('renders warning symbol for warning severity', () => {
    const { lastFrame } = render(
      <DiagnosticDisplay diagnostic={makeDiagnostic({ severity: 'warning' })} />,
    );
    expect(lastFrame()).toContain(symbols.warning);
  });
  it('renders suggestion when present', () => {
    const { lastFrame } = render(
      <DiagnosticDisplay diagnostic={makeDiagnostic({ suggestion: 'Add a response property' })} />,
    );
    expect(lastFrame()).toContain('Add a response property');
  });
  it('renders code frame with line numbers', () => {
    const { lastFrame } = render(
      <DiagnosticDisplay
        diagnostic={makeDiagnostic({
          sourceContext: {
            lines: [
              { number: 14, text: '  .get("/users/:id", {' },
              { number: 15, text: '    handler: async (ctx) => {' },
            ],
            highlightStart: 2,
            highlightLength: 7,
          },
        })}
      />,
    );
    expect(lastFrame()).toContain('14');
    expect(lastFrame()).toContain('.get("/users/:id"');
  });
  it('handles diagnostics without sourceContext', () => {
    const { lastFrame } = render(
      <DiagnosticDisplay diagnostic={makeDiagnostic({ sourceContext: undefined })} />,
    );
    expect(lastFrame()).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
  });
});
//# sourceMappingURL=diagnostic-display.test.js.map
