import { describe, expect, it } from 'vitest';
import type { CompilerDependencies } from '../compiler';
import { Compiler } from '../compiler';
import { resolveConfig } from '../config';
import { createDiagnostic } from '../errors';
import type { FileChange } from '../incremental';
import { categorizeChanges, IncrementalCompiler } from '../incremental';

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

describe('categorizeChanges', () => {
  it('categorizes schema files', () => {
    const changes: FileChange[] = [
      { path: 'src/modules/user/schemas/create-user.schema.ts', kind: 'modified' },
    ];
    const result = categorizeChanges(changes);

    expect(result.schema).toHaveLength(1);
    expect(result.schema[0].path).toBe('src/modules/user/schemas/create-user.schema.ts');
  });

  it('categorizes router files', () => {
    const changes: FileChange[] = [{ path: 'src/modules/user/user.router.ts', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.router).toHaveLength(1);
  });

  it('categorizes service files', () => {
    const changes: FileChange[] = [{ path: 'src/modules/user/user.service.ts', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.service).toHaveLength(1);
  });

  it('categorizes module files', () => {
    const changes: FileChange[] = [{ path: 'src/modules/user/user.module.ts', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.module).toHaveLength(1);
  });

  it('categorizes middleware files', () => {
    const changes: FileChange[] = [{ path: 'src/middleware/auth.ts', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.middleware).toHaveLength(1);
  });

  it('flags app entry as full recompile', () => {
    const changes: FileChange[] = [{ path: 'src/app.ts', kind: 'modified' }];
    const result = categorizeChanges(changes, { entryFile: 'src/app.ts' });

    expect(result.requiresFullRecompile).toBe(true);
  });

  it('flags .env as reboot', () => {
    const changes: FileChange[] = [{ path: '.env', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.requiresReboot).toBe(true);
    expect(result.rebootReason).toBe('env');
  });

  it('flags vertz.config.ts as reboot', () => {
    const changes: FileChange[] = [{ path: 'vertz.config.ts', kind: 'modified' }];
    const result = categorizeChanges(changes);

    expect(result.requiresReboot).toBe(true);
    expect(result.rebootReason).toBe('config');
  });

  it('reboot takes priority over full recompile in mixed batch', () => {
    const changes: FileChange[] = [
      { path: '.env', kind: 'modified' },
      { path: 'src/app.ts', kind: 'modified' },
      { path: 'src/modules/user/user.schema.ts', kind: 'modified' },
    ];
    const result = categorizeChanges(changes, { entryFile: 'src/app.ts' });

    expect(result.requiresReboot).toBe(true);
    expect(result.requiresFullRecompile).toBe(true);
    expect(result.schema).toHaveLength(1);
  });

  it('ignores non-matching files', () => {
    const changes: FileChange[] = [
      { path: 'src/utils/helpers.ts', kind: 'modified' },
      { path: 'README.md', kind: 'modified' },
    ];
    const result = categorizeChanges(changes);

    expect(result.schema).toHaveLength(0);
    expect(result.router).toHaveLength(0);
    expect(result.service).toHaveLength(0);
    expect(result.module).toHaveLength(0);
    expect(result.middleware).toHaveLength(0);
    expect(result.requiresFullRecompile).toBe(false);
    expect(result.requiresReboot).toBe(false);
  });
});

describe('IncrementalCompiler', () => {
  it('performs initial full compile', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);

    const result = await incremental.initialCompile();

    expect(result.success).toBe(true);
    expect(result.ir).toBeDefined();
    expect(calls).toContain('analyze:env');
  });

  it('returns reboot for .env change', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();

    const result = await incremental.handleChanges([{ path: '.env', kind: 'modified' }]);

    expect(result.kind).toBe('reboot');
    if (result.kind === 'reboot') {
      expect(result.reason).toBe('env');
    }
  });

  it('returns full-recompile for app entry change', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();

    const result = await incremental.handleChanges([{ path: 'src/app.ts', kind: 'modified' }]);

    expect(result.kind).toBe('full-recompile');
  });

  it('returns incremental for schema change', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();

    const result = await incremental.handleChanges([
      { path: 'src/modules/user/schemas/create-user.schema.ts', kind: 'modified' },
    ]);

    expect(result.kind).toBe('incremental');
  });

  it('runs generators on incremental change when no errors', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();
    calls.length = 0;

    await incremental.handleChanges([
      { path: 'src/modules/user/user.router.ts', kind: 'modified' },
    ]);

    expect(calls).toContain('generate');
  });

  it('skips generators on incremental change when errors exist', async () => {
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
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();
    calls.length = 0;

    await incremental.handleChanges([
      { path: 'src/modules/user/user.router.ts', kind: 'modified' },
    ]);

    expect(calls).not.toContain('generate');
  });

  it('handles empty change set', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);
    await incremental.initialCompile();

    const result = await incremental.handleChanges([]);

    expect(result.kind).toBe('incremental');
  });

  it('stores current IR after initial compile', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const incremental = new IncrementalCompiler(compiler);

    await incremental.initialCompile();

    expect(incremental.getCurrentIR()).toBeDefined();
    expect(incremental.getCurrentIR().app).toBeDefined();
  });
});
