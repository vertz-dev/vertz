import { describe, expect, it } from 'vitest';
import { Compiler } from '../compiler';
import { resolveConfig } from '../config';
import { createDiagnostic } from '../errors';
import type { CompilerDependencies, Validator } from '../compiler';

function stubAnalyzer(name: string, calls: string[]) {
  return {
    analyze: async () => {
      calls.push(`analyze:${name}`);
      return {};
    },
  };
}

function stubDependencies(calls: string[]): CompilerDependencies {
  return {
    analyzers: {
      env: stubAnalyzer('env', calls),
      schema: stubAnalyzer('schema', calls),
      middleware: stubAnalyzer('middleware', calls),
      module: stubAnalyzer('module', calls),
      app: stubAnalyzer('app', calls),
      dependencyGraph: stubAnalyzer('dependencyGraph', calls),
    },
    validators: [],
    generators: [],
  };
}

describe('Compiler', () => {
  it('runs all analyzers', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).toContain('analyze:env');
    expect(calls).toContain('analyze:schema');
    expect(calls).toContain('analyze:middleware');
    expect(calls).toContain('analyze:module');
    expect(calls).toContain('analyze:app');
    expect(calls).toContain('analyze:dependencyGraph');
  });

  it('runs validators after analyzers', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const validator: Validator = {
      validate: async () => {
        calls.push('validate');
        return [];
      },
    };
    deps.validators.push(validator);
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    const analyzeIndices = calls
      .filter((c) => c.startsWith('analyze:'))
      .map((c) => calls.indexOf(c));
    const validateIndex = calls.indexOf('validate');
    for (const idx of analyzeIndices) {
      expect(idx).toBeLessThan(validateIndex);
    }
  });

  it('runs generators when no errors', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).toContain('generate');
  });

  it('skips generators when errors exist', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      ],
    });
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).not.toContain('generate');
  });

  it('returns success: true when no errors', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.success).toBe(true);
  });

  it('returns success: false when errors exist', async () => {
    const deps = stubDependencies([]);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      ],
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.success).toBe(false);
  });

  it('collects diagnostics from all validators', async () => {
    const deps = stubDependencies([]);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'w1' }),
      ],
    });
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'info', code: 'VERTZ_DEAD_CODE', message: 'i1' }),
      ],
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.diagnostics).toHaveLength(2);
  });

  it('returns the assembled IR', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.ir).toBeDefined();
    expect(result.ir.app).toBeDefined();
    expect(result.ir.modules).toBeDefined();
    expect(result.ir.middleware).toBeDefined();
    expect(result.ir.schemas).toBeDefined();
  });
});
