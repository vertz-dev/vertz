import { Command } from 'commander';
import { buildAction } from './commands/build';
import { createAction } from './commands/create';
import { devAction } from './commands/dev';
import { generateDomainAction } from './commands/domain-gen';
import { generateAction } from './commands/generate';
import { smartMigrateAction } from './commands/migrate-smart';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('vertz')
    .description('Vertz CLI — build, check, and serve your Vertz app')
    .version('0.1.0');

  // Create command - scaffold a new Vertz project
  program
    .command('create <name>')
    .description('Scaffold a new Vertz project')
    .option('-r, --runtime <runtime>', 'Runtime to use (bun, node, deno)', 'bun')
    .option('-e, --example', 'Include example health module')
    .option('--no-example', 'Exclude example health module')
    .action(async (name: string, opts: { runtime: string; example?: boolean }) => {
      await createAction({
        projectName: name,
        runtime: opts.runtime,
        example: opts.example,
      });
    });

  program
    .command('check')
    .description('Type-check and validate the project')
    .option('--strict', 'Enable strict mode')
    .option('--format <format>', 'Output format (text, json, github)', 'text');

  program
    .command('build')
    .description('Compile the project for production')
    .option('--strict', 'Enable strict mode')
    .option('-o, --output <dir>', 'Output directory', '.vertz/build')
    .option('-t, --target <target>', 'Build target (node, edge, worker)', 'node')
    .option('--no-typecheck', 'Disable type checking')
    .option('--no-minify', 'Disable minification')
    .option('--sourcemap', 'Generate sourcemaps')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      const exitCode = await buildAction({
        strict: opts.strict,
        output: opts.output,
        target: opts.target,
        noTypecheck: opts.noTypecheck,
        noMinify: opts.noMinify,
        sourcemap: opts.sourcemap,
        verbose: opts.verbose,
      });
      process.exit(exitCode);
    });

  // Unified dev command - Phase 1 implementation
  program
    .command('dev')
    .description('Start development server with hot reload (unified pipeline)')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--host <host>', 'Server host', 'localhost')
    .option('--open', 'Open browser on start')
    .option('--no-typecheck', 'Disable background type checking')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
      });
    });

  // Generate command - supports both explicit type and auto-discovery mode
  program
    .command('generate [type] [name]')
    .description('Generate a module, service, router, schema, or auto-discover domains')
    .option('--dry-run', 'Preview generated files without writing')
    .option('--source-dir <dir>', 'Source directory', 'src')
    .allowUnknownOption()
    .action(async (type, name, options) => {
      // If no type provided or type is not recognized, try domain auto-discovery
      if (!type) {
        await generateDomainAction(options);
        return;
      }

      const validTypes = ['module', 'service', 'router', 'schema'];
      if (!validTypes.includes(type)) {
        // Try domain generation
        await generateDomainAction(options);
        return;
      }

      // Handle traditional generate types
      const result = generateAction({
        type,
        name: name || '',
        module: options.module,
        sourceDir: options.sourceDir,
        dryRun: options.dryRun,
      });

      if (!result.success) {
        console.error(result.error);
        process.exit(1);
      }
    });

  program
    .command('codegen')
    .description('Generate SDK and CLI clients from the compiled API')
    .option('--dry-run', 'Preview generated files without writing')
    .option('--output <dir>', 'Output directory');

  program
    .command('routes')
    .description('Display the route table')
    .option('--format <format>', 'Output format (table, json)', 'table');

  // Database commands - Smart migrate
  const dbCommand = program.command('db').description('Database management commands');

  dbCommand
    .command('migrate')
    .description('Smart database migration (dev: migrate dev, prod: migrate deploy)')
    .option('--create-only', 'Create migration file without applying (dev only)')
    .option('--reset', 'Reset database (drops all tables)')
    .option('--status', 'Show migration status without running migrations')
    .option('-n, --name <name>', 'Migration name (required with --create-only)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      await smartMigrateAction({
        createOnly: opts.createOnly,
        reset: opts.reset,
        status: opts.status,
        name: opts.name ?? undefined,
        verbose: opts.verbose,
      });
    });

  return program;
}
