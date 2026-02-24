import { Project } from 'ts-morph';
import { describe, expect, it } from 'bun:test';
import { BaseAnalyzer } from '../analyzers/base-analyzer';
import { resolveConfig } from '../config';
import { createDiagnostic } from '../errors';

class TestAnalyzer extends BaseAnalyzer<string> {
  async analyze(): Promise<string> {
    return 'test';
  }

  emitDiagnostic(): void {
    this.addDiagnostic(
      createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'test' }),
    );
  }
}

function createTestAnalyzer(): TestAnalyzer {
  const project = new Project({ useInMemoryFileSystem: true });
  return new TestAnalyzer(project, resolveConfig());
}

describe('BaseAnalyzer', () => {
  it('stores project and config', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const config = resolveConfig({ strict: true });
    const analyzer = new TestAnalyzer(project, config);
    // biome-ignore lint/complexity/useLiteralKeys: accessing protected member for testing
    expect(analyzer['project']).toBe(project);
    // biome-ignore lint/complexity/useLiteralKeys: accessing protected member for testing
    expect(analyzer['config']).toBe(config);
  });

  it('accumulates diagnostics via addDiagnostic', () => {
    const analyzer = createTestAnalyzer();
    analyzer.emitDiagnostic();
    analyzer.emitDiagnostic();
    expect(analyzer.getDiagnostics()).toHaveLength(2);
  });

  it('getDiagnostics returns a copy (not the internal array)', () => {
    const analyzer = createTestAnalyzer();
    analyzer.emitDiagnostic();
    const copy = analyzer.getDiagnostics();
    copy.push(createDiagnostic({ severity: 'info', code: 'VERTZ_DEAD_CODE', message: 'extra' }));
    expect(analyzer.getDiagnostics()).toHaveLength(1);
  });

  it('starts with empty diagnostics', () => {
    const analyzer = createTestAnalyzer();
    expect(analyzer.getDiagnostics()).toEqual([]);
  });
});
