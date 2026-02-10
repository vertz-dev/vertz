import { describe, expect, it } from 'vitest';
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
});
