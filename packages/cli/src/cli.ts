import { Command } from 'commander';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('vertz')
    .description('Vertz CLI — build, check, and serve your Vertz app')
    .version('0.1.0');

  program
    .command('check')
    .description('Type-check and validate the project')
    .option('--strict', 'Enable strict mode')
    .option('--format <format>', 'Output format (text, json, github)', 'text');

  program
    .command('build')
    .description('Compile the project for production')
    .option('--strict', 'Enable strict mode')
    .option('--output <dir>', 'Output directory');

  program
    .command('dev')
    .description('Start development server with hot reload')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--host <host>', 'Server host', 'localhost')
    .option('--no-typecheck', 'Disable background type checking');

  program
    .command('generate <type> [name]')
    .description('Generate a module, service, router, or schema')
    .option('--dry-run', 'Preview generated files without writing');

  program
    .command('routes')
    .description('Display the route table')
    .option('--format <format>', 'Output format (table, json)', 'table');

  return program;
}
