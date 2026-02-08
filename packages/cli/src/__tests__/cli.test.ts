import { describe, expect, it } from 'vitest';
import { createCLI } from '../cli.js';

describe('createCLI', () => {
  it('returns a Commander Command instance', () => {
    const program = createCLI();
    expect(program).toBeDefined();
    expect(program.name()).toBe('vertz');
  });

  it('has a version string', () => {
    const program = createCLI();
    expect(program.version()).toBeDefined();
    expect(typeof program.version()).toBe('string');
  });

  it('registers the dev command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('dev');
  });

  it('registers the build command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('build');
  });

  it('registers the generate command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('generate');
  });

  it('registers the check command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('check');
  });

  it('registers the deploy command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('deploy');
  });

  it('registers the routes command', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('routes');
  });

  it('registers all six expected commands', () => {
    const program = createCLI();
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toEqual(['dev', 'build', 'generate', 'check', 'deploy', 'routes']);
  });
});
