import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockFunction,
  mock,
  spyOn,
} from '@vertz/test';
import { join } from 'node:path';
import { createCLI } from '../cli';

describe('createCLI', () => {
  it('creates a Commander program', () => {
    const program = createCLI();
    expect(program).toBeDefined();
  });

  it('sets program name to vertz', () => {
    const program = createCLI();
    expect(program.name()).toBe('vertz');
  });

  it('reads version from package.json (not hardcoded)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '../../package.json'), 'utf-8'));
    const program = createCLI();
    expect(program.version()).toBe(pkg.version);
  });

  it('registers check command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'check');
    expect(cmd).toBeDefined();
  });

  it('registers build command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'build');
    expect(cmd).toBeDefined();
  });

  it('registers dev command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'dev');
    expect(cmd).toBeDefined();
  });

  it('registers generate command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'generate');
    expect(cmd).toBeDefined();
  });

  it('registers codegen command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'codegen');
    expect(cmd).toBeDefined();
  });

  it('codegen command has dry-run option', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'codegen');
    const option = cmd?.options.find((o) => o.long === '--dry-run');
    expect(option).toBeDefined();
  });

  it('registers routes command', () => {
    const program = createCLI();
    const cmd = program.commands.find((c) => c.name() === 'routes');
    expect(cmd).toBeDefined();
  });

  it('has a description', () => {
    const program = createCLI();
    expect(program.description()).toContain('Vertz');
  });

  describe('db subcommands', () => {
    function getDbCommand() {
      const program = createCLI();
      return program.commands.find((c) => c.name() === 'db');
    }

    it('registers db command', () => {
      expect(getDbCommand()).toBeDefined();
    });

    it('registers db migrate subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'migrate');
      expect(sub).toBeDefined();
    });

    it('db migrate has --name option', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'migrate');
      const opt = sub?.options.find((o) => o.long === '--name');
      expect(opt).toBeDefined();
    });

    it('db migrate has --dry-run option', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'migrate');
      const opt = sub?.options.find((o) => o.long === '--dry-run');
      expect(opt).toBeDefined();
    });

    it('registers db push subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'push');
      expect(sub).toBeDefined();
    });

    it('registers db deploy subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'deploy');
      expect(sub).toBeDefined();
    });

    it('db deploy has --dry-run option', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'deploy');
      const opt = sub?.options.find((o) => o.long === '--dry-run');
      expect(opt).toBeDefined();
    });

    it('registers db status subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'status');
      expect(sub).toBeDefined();
    });

    it('registers db reset subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'reset');
      expect(sub).toBeDefined();
    });

    it('registers db baseline subcommand', () => {
      const db = getDbCommand();
      const sub = db?.commands.find((c) => c.name() === 'baseline');
      expect(sub).toBeDefined();
    });
  });

  describe('command action error handling', () => {
    let exitSpy: MockFunction<(...args: unknown[]) => unknown>;
    let errorSpy: MockFunction<(...args: unknown[]) => unknown>;
    let createSpy: MockFunction<(...args: unknown[]) => unknown>;
    let buildSpy: MockFunction<(...args: unknown[]) => unknown>;
    let devSpy: MockFunction<(...args: unknown[]) => unknown>;
    let generateSpy: MockFunction<(...args: unknown[]) => unknown>;

    beforeEach(async () => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      errorSpy = spyOn(console, 'error').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;
    });

    afterEach(async () => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      createSpy?.mockRestore();
      buildSpy?.mockRestore();
      devSpy?.mockRestore();
      generateSpy?.mockRestore();
    });

    it('calls process.exit(1) when create action returns err', async () => {
      const createMod = await import('../commands/create');
      createSpy = spyOn(createMod, 'createAction').mockResolvedValue({
        ok: false,
        error: new Error('create failed'),
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'create', 'my-app']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('create failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit when create action returns ok', async () => {
      const createMod = await import('../commands/create');
      createSpy = spyOn(createMod, 'createAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'create', 'my-app']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('calls process.exit(1) when build action returns err', async () => {
      const buildMod = await import('../commands/build');
      buildSpy = spyOn(buildMod, 'buildAction').mockResolvedValue({
        ok: false,
        error: new Error('build failed'),
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'build']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('build failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit when build action returns ok', async () => {
      const buildMod = await import('../commands/build');
      buildSpy = spyOn(buildMod, 'buildAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'build']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('calls process.exit(1) when dev action returns err', async () => {
      const devMod = await import('../commands/dev');
      devSpy = spyOn(devMod, 'devAction').mockResolvedValue({
        ok: false,
        error: new Error('dev failed'),
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'dev']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('dev failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit when dev action returns ok', async () => {
      const devMod = await import('../commands/dev');
      devSpy = spyOn(devMod, 'devAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'dev']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('calls process.exit(1) when generate action returns err', async () => {
      const genMod = await import('../commands/generate');
      generateSpy = spyOn(genMod, 'generateAction').mockReturnValue({
        ok: false,
        error: new Error('generate failed'),
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'generate', 'module', 'users']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('generate failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit when generate action returns ok', async () => {
      const genMod = await import('../commands/generate');
      generateSpy = spyOn(genMod, 'generateAction').mockReturnValue({
        ok: true,
        data: { files: [] },
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'generate', 'module', 'users']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('calls process.exit(1) when start action returns err', async () => {
      const startMod = await import('../commands/start');
      const startSpy = spyOn(startMod, 'startAction').mockResolvedValue({
        ok: false,
        error: new Error('start failed'),
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'start']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('start failed');
      expect(exitSpy).toHaveBeenCalledWith(1);

      startSpy.mockRestore();
    });

    it('does not call process.exit when start action returns ok', async () => {
      const startMod = await import('../commands/start');
      const startSpy = spyOn(startMod, 'startAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'start']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();

      startSpy.mockRestore();
    });

    it('calls process.exit(1) when generate type is invalid', async () => {
      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'generate', 'invalid-type', 'name']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown generate type: invalid-type'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('calls process.exit(1) when generate type is omitted', async () => {
      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'generate']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown generate type: (none)'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('codegen command action', () => {
    let exitSpy: MockFunction<(...args: unknown[]) => unknown>;
    let errorSpy: MockFunction<(...args: unknown[]) => unknown>;
    let logSpy: MockFunction<(...args: unknown[]) => unknown>;

    beforeEach(() => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      errorSpy = spyOn(console, 'error').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      logSpy = spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('calls process.exit(1) when compilation fails', async () => {
      const compilerMod = await import('@vertz/compiler');
      const compilerSpy = spyOn(compilerMod, 'createCompiler').mockReturnValue({
        compile: mock().mockResolvedValue({ success: false, errors: ['some error'] }),
      } as never);

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'codegen']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Compilation failed with errors.');
      expect(exitSpy).toHaveBeenCalledWith(1);

      compilerSpy.mockRestore();
    });

    it('calls process.exit(1) when compiler throws', async () => {
      const compilerMod = await import('@vertz/compiler');
      const compilerSpy = spyOn(compilerMod, 'createCompiler').mockReturnValue({
        compile: mock().mockRejectedValue(new Error('compiler error')),
      } as never);

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'codegen']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Failed to compile app: compiler error');
      expect(exitSpy).toHaveBeenCalledWith(1);

      compilerSpy.mockRestore();
    });

    it('runs codegen pipeline on successful compilation', async () => {
      const mockIR = { modules: [], routes: [] };
      const compilerMod = await import('@vertz/compiler');
      const compilerSpy = spyOn(compilerMod, 'createCompiler').mockReturnValue({
        compile: mock().mockResolvedValue({ success: true, ir: mockIR }),
      } as never);

      const mockCodegenIR = { modules: [] };
      const codegenMod = await import('@vertz/codegen');
      const adaptIRSpy = spyOn(codegenMod, 'adaptIR').mockReturnValue(mockCodegenIR as never);

      const mockPipeline = {
        validate: mock().mockReturnValue([]),
        generate: mock().mockReturnValue({ files: [], fileCount: 0, generators: ['test'] }),
        resolveOutputDir: mock().mockReturnValue('/out'),
      };
      const pipelineSpy = vi
        .spyOn(codegenMod, 'createCodegenPipeline')
        .mockReturnValue(mockPipeline as never);

      const codegenActionMod = await import('../commands/codegen');
      const codegenSpy = spyOn(codegenActionMod, 'codegenAction').mockResolvedValue({
        ok: true,
        data: { output: 'Generated 0 files (test)', fileCount: 0 },
      } as never);

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'codegen']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(compilerSpy).toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();

      compilerSpy.mockRestore();
      adaptIRSpy.mockRestore();
      pipelineSpy.mockRestore();
      codegenSpy.mockRestore();
    });

    it('calls process.exit(1) when codegenAction returns err', async () => {
      const compilerMod = await import('@vertz/compiler');
      const compilerSpy = spyOn(compilerMod, 'createCompiler').mockReturnValue({
        compile: mock().mockResolvedValue({ success: true, ir: {} }),
      } as never);

      const codegenMod = await import('@vertz/codegen');
      const adaptIRSpy = spyOn(codegenMod, 'adaptIR').mockReturnValue({} as never);
      const pipelineSpy = vi
        .spyOn(codegenMod, 'createCodegenPipeline')
        .mockReturnValue({} as never);

      const codegenActionMod = await import('../commands/codegen');
      const codegenSpy = spyOn(codegenActionMod, 'codegenAction').mockResolvedValue({
        ok: false,
        error: new Error('codegen failed'),
      } as never);

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'codegen']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('codegen failed');
      expect(exitSpy).toHaveBeenCalledWith(1);

      compilerSpy.mockRestore();
      adaptIRSpy.mockRestore();
      pipelineSpy.mockRestore();
      codegenSpy.mockRestore();
    });
  });

  describe('db command actions', () => {
    let exitSpy: MockFunction<(...args: unknown[]) => unknown>;
    let errorSpy: MockFunction<(...args: unknown[]) => unknown>;
    let logSpy: MockFunction<(...args: unknown[]) => unknown>;
    let loadDbSpy: MockFunction<(...args: unknown[]) => unknown>;
    let migrateSpy: MockFunction<(...args: unknown[]) => unknown>;
    let pushSpy: MockFunction<(...args: unknown[]) => unknown>;
    let deploySpy: MockFunction<(...args: unknown[]) => unknown>;
    let statusSpy: MockFunction<(...args: unknown[]) => unknown>;
    let resetSpy: MockFunction<(...args: unknown[]) => unknown>;
    let baselineSpy: MockFunction<(...args: unknown[]) => unknown>;

    const mockCtx = {
      queryFn: mock(),
      currentSnapshot: { version: 1, tables: {}, enums: {} },
      previousSnapshot: { version: 1, tables: {}, enums: {} },
      migrationFiles: [],
      migrationsDir: '/tmp/migrations',
      existingFiles: [],
      dialect: { name: 'sqlite' },
      writeFile: mock(),
      readFile: mock(),
      close: mock().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      errorSpy = spyOn(console, 'error').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      logSpy = spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;

      const loadDbMod = await import('../commands/load-db-context');
      loadDbSpy = vi
        .spyOn(loadDbMod, 'loadDbContext')
        .mockResolvedValue(mockCtx as never) as MockFunction<(...args: unknown[]) => unknown>;
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
      loadDbSpy.mockRestore();
      migrateSpy?.mockRestore();
      pushSpy?.mockRestore();
      deploySpy?.mockRestore();
      statusSpy?.mockRestore();
      resetSpy?.mockRestore();
      baselineSpy?.mockRestore();
      mockCtx.close.mockClear();
      mockCtx.queryFn.mockClear();
      mockCtx.writeFile.mockClear();
      mockCtx.readFile.mockClear();
    });

    it('calls process.exit(1) when loadDbContext throws', async () => {
      loadDbSpy.mockRejectedValue(new Error('config error'));

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'push']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Configuration error: config error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('db migrate — success path with applied migration', async () => {
      const dbMod = await import('../commands/db');
      migrateSpy = spyOn(dbMod, 'dbMigrateAction').mockResolvedValue({
        ok: true,
        data: { migrationFile: '001_init.sql', sql: 'CREATE TABLE ...', dryRun: false },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'migrate', '--name', 'init']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(migrateSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Migration applied: 001_init.sql');
      expect(mockCtx.close).toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('db migrate — dry-run path', async () => {
      const dbMod = await import('../commands/db');
      migrateSpy = spyOn(dbMod, 'dbMigrateAction').mockResolvedValue({
        ok: true,
        data: { migrationFile: '001_init.sql', sql: 'CREATE TABLE foo;', dryRun: true },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'migrate', '--dry-run']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('[dry-run] Migration file: 001_init.sql');
      expect(logSpy).toHaveBeenCalledWith('CREATE TABLE foo;');
    });

    it('db migrate — error from action calls process.exit(1)', async () => {
      const dbMod = await import('../commands/db');
      migrateSpy = spyOn(dbMod, 'dbMigrateAction').mockResolvedValue({
        ok: false,
        error: new Error('migrate failed'),
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'migrate']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Command failed: migrate failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db push — success with changes', async () => {
      const dbMod = await import('../commands/db');
      pushSpy = spyOn(dbMod, 'dbPushAction').mockResolvedValue({
        ok: true,
        data: { tablesAffected: ['users', 'tasks'] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'push']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('Pushed changes to: users, tasks');
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db push — success with no changes', async () => {
      const dbMod = await import('../commands/db');
      pushSpy = spyOn(dbMod, 'dbPushAction').mockResolvedValue({
        ok: true,
        data: { tablesAffected: [] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'push']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('No changes to push.');
    });

    it('db deploy — success with applied migrations', async () => {
      const dbMod = await import('../commands/db');
      deploySpy = spyOn(dbMod, 'dbDeployAction').mockResolvedValue({
        ok: true,
        data: { applied: ['001_init', '002_users'], dryRun: false },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'deploy']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('Applied: 001_init, 002_users');
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db deploy — no pending migrations', async () => {
      const dbMod = await import('../commands/db');
      deploySpy = spyOn(dbMod, 'dbDeployAction').mockResolvedValue({
        ok: true,
        data: { applied: [], dryRun: false },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'deploy']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('No pending migrations.');
    });

    it('db status — shows applied, pending, code changes, and drift', async () => {
      const dbMod = await import('../commands/db');
      statusSpy = spyOn(dbMod, 'dbStatusAction').mockResolvedValue({
        ok: true,
        data: {
          applied: ['001_init'],
          pending: ['002_users'],
          codeChanges: [{ description: 'added column email' }],
          drift: [{ description: 'extra index on users' }],
        },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'status']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('Applied: 1');
      expect(logSpy).toHaveBeenCalledWith('Pending: 1');
      expect(logSpy).toHaveBeenCalledWith('  - 002_users');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Code changes:'));
      expect(logSpy).toHaveBeenCalledWith('  - added column email');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected:'));
      expect(logSpy).toHaveBeenCalledWith('  - extra index on users');
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db status — schema in sync', async () => {
      const dbMod = await import('../commands/db');
      statusSpy = spyOn(dbMod, 'dbStatusAction').mockResolvedValue({
        ok: true,
        data: {
          applied: ['001_init'],
          pending: [],
          codeChanges: [],
          drift: [],
        },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'status']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('Applied: 1');
      expect(logSpy).toHaveBeenCalledWith('Pending: 0');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Schema is in sync.'));
    });

    it('db reset — with --force flag', async () => {
      const dbMod = await import('../commands/db');
      resetSpy = spyOn(dbMod, 'dbResetAction').mockResolvedValue({
        ok: true,
        data: { tablesDropped: ['users', 'tasks'], migrationsApplied: ['001_init'] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'reset', '--force']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(resetSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Dropped: 2 table(s)');
      expect(logSpy).toHaveBeenCalledWith('Applied: 1 migration(s)');
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db baseline — success with recorded migrations', async () => {
      const dbMod = await import('../commands/db');
      baselineSpy = spyOn(dbMod, 'dbBaselineAction').mockResolvedValue({
        ok: true,
        data: { recorded: ['001_init', '002_users'] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'baseline']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('Recorded: 001_init, 002_users');
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('db baseline — all migrations already recorded', async () => {
      const dbMod = await import('../commands/db');
      baselineSpy = spyOn(dbMod, 'dbBaselineAction').mockResolvedValue({
        ok: true,
        data: { recorded: [] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'baseline']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('All migrations already recorded.');
    });

    it('db deploy — dry-run path', async () => {
      const dbMod = await import('../commands/db');
      deploySpy = spyOn(dbMod, 'dbDeployAction').mockResolvedValue({
        ok: true,
        data: { applied: ['001_init'], dryRun: true },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'deploy', '--dry-run']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('[dry-run] Would apply: 001_init');
    });

    it('db migrate — dry-run with no SQL', async () => {
      const dbMod = await import('../commands/db');
      migrateSpy = spyOn(dbMod, 'dbMigrateAction').mockResolvedValue({
        ok: true,
        data: { migrationFile: '001_noop.sql', sql: '', dryRun: true },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'migrate', '--dry-run']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('-- no changes');
    });

    it('db status — shows only code changes without drift', async () => {
      const dbMod = await import('../commands/db');
      statusSpy = spyOn(dbMod, 'dbStatusAction').mockResolvedValue({
        ok: true,
        data: {
          applied: ['001_init'],
          pending: [],
          codeChanges: [{ description: 'new column added' }],
          drift: [],
        },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'status']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Code changes:'));
      expect(logSpy).toHaveBeenCalledWith('  - new column added');
      // Should not print "Schema is in sync" since there are code changes
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Schema is in sync'));
    });

    it('db status — shows only drift without code changes', async () => {
      const dbMod = await import('../commands/db');
      statusSpy = spyOn(dbMod, 'dbStatusAction').mockResolvedValue({
        ok: true,
        data: {
          applied: ['001_init'],
          pending: [],
          codeChanges: [],
          drift: [{ description: 'unexpected index' }],
        },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'status']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected:'));
      expect(logSpy).toHaveBeenCalledWith('  - unexpected index');
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Schema is in sync'));
    });

    it('closes connection even when close() throws', async () => {
      mockCtx.close.mockRejectedValue(new Error('close failed'));

      const dbMod = await import('../commands/db');
      pushSpy = spyOn(dbMod, 'dbPushAction').mockResolvedValue({
        ok: true,
        data: { tablesAffected: [] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'push']);
      } catch {
        // Commander may throw on exitOverride
      }

      // Should not throw even though close() fails
      expect(mockCtx.close).toHaveBeenCalled();
    });
  });

  describe('db pull command actions', () => {
    let exitSpy: MockFunction<(...args: unknown[]) => unknown>;
    let errorSpy: MockFunction<(...args: unknown[]) => unknown>;
    let logSpy: MockFunction<(...args: unknown[]) => unknown>;
    let loadIntrospectSpy: MockFunction<(...args: unknown[]) => unknown>;
    let pullSpy: MockFunction<(...args: unknown[]) => unknown>;

    const mockIntrospectCtx = {
      queryFn: mock(),
      dialect: { name: 'sqlite' },
      dialectName: 'sqlite' as const,
      close: mock().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      errorSpy = spyOn(console, 'error').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      logSpy = spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
        (...args: unknown[]) => unknown
      >;

      const loadDbMod = await import('../commands/load-db-context');
      loadIntrospectSpy = vi
        .spyOn(loadDbMod, 'loadIntrospectContext')
        .mockResolvedValue(mockIntrospectCtx as never) as MockFunction<
        (...args: unknown[]) => unknown
      >;
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
      loadIntrospectSpy.mockRestore();
      pullSpy?.mockRestore();
      mockIntrospectCtx.close.mockClear();
    });

    it('calls process.exit(1) when loadIntrospectContext throws', async () => {
      loadIntrospectSpy.mockRejectedValue(new Error('introspect config error'));

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Configuration error: introspect config error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('db pull — dry-run prints file contents', async () => {
      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: { files: [{ path: 'schema.ts', content: 'export const users = {}' }] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull', '--dry-run']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('// --- schema.ts ---');
      expect(logSpy).toHaveBeenCalledWith('export const users = {}');
      expect(mockIntrospectCtx.close).toHaveBeenCalled();
    });

    it('db pull — prints to stdout when no output specified', async () => {
      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: { files: [{ path: 'schema.ts', content: 'export const users = {}' }] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith('export const users = {}');
      expect(mockIntrospectCtx.close).toHaveBeenCalled();
    });

    it('db pull — error from action calls process.exit(1)', async () => {
      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: false,
        error: new Error('pull failed'),
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith('Command failed: pull failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockIntrospectCtx.close).toHaveBeenCalled();
    });

    it('db pull — writes files when output path is specified', async () => {
      const tmpDir = join(import.meta.dir, `.tmp-cli-pull-test-${Date.now()}`);
      const outputFile = join(tmpDir, 'generated-schema.ts');

      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: { files: [{ path: 'schema.ts', content: 'export const users = {}' }] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull', '-o', outputFile, '--force']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith(`Generated: ${outputFile}`);
      expect(mockIntrospectCtx.close).toHaveBeenCalled();

      // Clean up
      const { rmSync } = await import('node:fs');
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('db pull — writes per-table files when output is directory', async () => {
      const tmpDir = join(import.meta.dir, `.tmp-cli-pull-dir-${Date.now()}`);

      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: {
          files: [
            { path: 'users.ts', content: 'export const users = {}' },
            { path: 'posts.ts', content: 'export const posts = {}' },
          ],
        },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull', '-o', `${tmpDir}/`, '--force']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(logSpy).toHaveBeenCalledWith(`Generated: ${join(tmpDir, 'users.ts')}`);
      expect(logSpy).toHaveBeenCalledWith(`Generated: ${join(tmpDir, 'posts.ts')}`);

      const { rmSync } = await import('node:fs');
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('db pull — exits when output file exists without --force', async () => {
      const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
      const tmpDir = join(import.meta.dir, `.tmp-cli-pull-exists-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const outputFile = join(tmpDir, 'schema.ts');
      writeFileSync(outputFile, 'existing content');

      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: { files: [{ path: 'schema.ts', content: 'new content' }] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull', '-o', outputFile]);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(errorSpy).toHaveBeenCalledWith(`File ${outputFile} already exists.`);
      expect(exitSpy).toHaveBeenCalledWith(1);

      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('db pull — close() failure is swallowed', async () => {
      mockIntrospectCtx.close.mockRejectedValue(new Error('close failed'));

      const dbMod = await import('../commands/db');
      pullSpy = spyOn(dbMod, 'dbPullAction').mockResolvedValue({
        ok: true,
        data: { files: [{ path: 'schema.ts', content: 'export const users = {}' }] },
      } as never) as MockFunction<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'db', 'pull']);
      } catch {
        // Commander may throw on exitOverride
      }

      // Should not throw — close error is swallowed
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
