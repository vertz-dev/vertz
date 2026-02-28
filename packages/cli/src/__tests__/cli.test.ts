import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'bun:test';
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

  it('sets a version', () => {
    const program = createCLI();
    expect(program.version()).toBe('0.1.0');
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
    let exitSpy: Mock<(...args: unknown[]) => unknown>;
    let errorSpy: Mock<(...args: unknown[]) => unknown>;
    let createSpy: Mock<(...args: unknown[]) => unknown>;
    let buildSpy: Mock<(...args: unknown[]) => unknown>;
    let devSpy: Mock<(...args: unknown[]) => unknown>;
    let generateSpy: Mock<(...args: unknown[]) => unknown>;

    beforeEach(async () => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never) as Mock<
        (...args: unknown[]) => unknown
      >;
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock<
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
      createSpy = vi.spyOn(createMod, 'createAction').mockResolvedValue({
        ok: false,
        error: new Error('create failed'),
      }) as Mock<(...args: unknown[]) => unknown>;

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
      createSpy = vi.spyOn(createMod, 'createAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as Mock<(...args: unknown[]) => unknown>;

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
      buildSpy = vi.spyOn(buildMod, 'buildAction').mockResolvedValue({
        ok: false,
        error: new Error('build failed'),
      }) as Mock<(...args: unknown[]) => unknown>;

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
      buildSpy = vi.spyOn(buildMod, 'buildAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as Mock<(...args: unknown[]) => unknown>;

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
      devSpy = vi.spyOn(devMod, 'devAction').mockResolvedValue({
        ok: false,
        error: new Error('dev failed'),
      }) as Mock<(...args: unknown[]) => unknown>;

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
      devSpy = vi.spyOn(devMod, 'devAction').mockResolvedValue({
        ok: true,
        data: undefined,
      }) as Mock<(...args: unknown[]) => unknown>;

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
      generateSpy = vi.spyOn(genMod, 'generateAction').mockReturnValue({
        ok: false,
        error: new Error('generate failed'),
      }) as Mock<(...args: unknown[]) => unknown>;

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
      generateSpy = vi.spyOn(genMod, 'generateAction').mockReturnValue({
        ok: true,
        data: { files: [] },
      }) as Mock<(...args: unknown[]) => unknown>;

      const program = createCLI();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'vertz', 'generate', 'module', 'users']);
      } catch {
        // Commander may throw on exitOverride
      }

      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
