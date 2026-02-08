import { Command } from 'commander';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('vertz')
    .description('Vertz -- Type-safe backend framework for LLMs')
    .version('0.1.0');

  program.command('dev').description('Start development server with watch mode');

  program.command('build').description('Run production build');

  program.command('generate').description('Scaffold code following Vertz conventions');

  program.command('check').description('Run compiler validators without building');

  program.command('deploy').description('Generate deployment configuration');

  program.command('routes').description('Display the route table');

  return program;
}
