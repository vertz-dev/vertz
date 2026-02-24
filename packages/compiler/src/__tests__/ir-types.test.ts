import { describe, expect, it } from 'bun:test';
import { createDiagnostic } from '../errors';
import { addDiagnosticsToIR, createEmptyAppIR, createEmptyDependencyGraph } from '../ir/builder';

describe('createEmptyAppIR', () => {
  it('returns an AppIR with empty collections', () => {
    const ir = createEmptyAppIR();
    expect(ir.app.basePath).toBe('');
    expect(ir.app.globalMiddleware).toEqual([]);
    expect(ir.app.moduleRegistrations).toEqual([]);
    expect(ir.modules).toEqual([]);
    expect(ir.middleware).toEqual([]);
    expect(ir.schemas).toEqual([]);
    expect(ir.diagnostics).toEqual([]);
    expect(ir.env).toBeUndefined();
    expect(ir.dependencyGraph.nodes).toEqual([]);
    expect(ir.dependencyGraph.edges).toEqual([]);
    expect(ir.dependencyGraph.initializationOrder).toEqual([]);
    expect(ir.dependencyGraph.circularDependencies).toEqual([]);
  });

  it('returns a fresh object each call (no shared state)', () => {
    const a = createEmptyAppIR();
    const b = createEmptyAppIR();
    expect(a).not.toBe(b);
    a.modules.push({} as never);
    expect(b.modules).toHaveLength(0);
  });
});

describe('createEmptyDependencyGraph', () => {
  it('returns empty graph', () => {
    const graph = createEmptyDependencyGraph();
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.initializationOrder).toEqual([]);
    expect(graph.circularDependencies).toEqual([]);
  });
});

describe('addDiagnosticsToIR', () => {
  it('returns new AppIR with merged diagnostics', () => {
    const ir = createEmptyAppIR();
    const d1 = createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'a' });
    const d2 = createDiagnostic({
      severity: 'warning',
      code: 'VERTZ_SERVICE_UNUSED',
      message: 'b',
    });
    const result = addDiagnosticsToIR(ir, [d1, d2]);
    expect(result.diagnostics).toHaveLength(2);
    expect(ir.diagnostics).toHaveLength(0);
  });

  it('preserves existing diagnostics', () => {
    const d1 = createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'a' });
    const ir = addDiagnosticsToIR(createEmptyAppIR(), [d1]);
    const d2 = createDiagnostic({
      severity: 'warning',
      code: 'VERTZ_SERVICE_UNUSED',
      message: 'b',
    });
    const result = addDiagnosticsToIR(ir, [d2]);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toBe(d1);
    expect(result.diagnostics[1]).toBe(d2);
  });
});
