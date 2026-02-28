import type { CodegenConfig, CodegenIR } from '@vertz/codegen';
import { Command } from 'commander';
import { createJiti } from 'jiti';
import { buildAction } from './commands/build';
import { codegenAction } from './commands/codegen';
import { createAction } from './commands/create';
import type { DbCommandContext } from './commands/db';
import {
  dbBaselineAction,
  dbDeployAction,
  dbMigrateAction,
  dbPushAction,
  dbResetAction,
  dbStatusAction,
} from './commands/db';
import { devAction } from './commands/dev';
import { generateAction } from './commands/generate';
import { loadDbContext } from './commands/load-db-context';

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
      const result = await createAction({
        projectName: name,
        runtime: opts.runtime,
        example: opts.example,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
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
      const result = await buildAction({
        strict: opts.strict,
        output: opts.output,
        target: opts.target,
        noTypecheck: opts.noTypecheck,
        noMinify: opts.noMinify,
        sourcemap: opts.sourcemap,
        verbose: opts.verbose,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
    });

  // Unified dev command - Phase 1 implementation
  program
    .command('dev')
    .description('Start development server with hot reload (unified pipeline)')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--host <host>', 'Server host', 'localhost')
    .option('--open', 'Open browser on start')
    .option('--no-typecheck', 'Disable background type checking')
    .option('--ssr', 'Enable SSR mode (server-side rendering, no HMR)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      const result = await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        ssr: opts.ssr,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
    });

  // Generate command - supports both explicit type and auto-discovery mode
  program
    .command('generate [type] [name]')
    .description('Generate a module, service, router, or schema')
    .option('--dry-run', 'Preview generated files without writing')
    .option('--source-dir <dir>', 'Source directory', 'src')
    .allowUnknownOption()
    .action(async (type, name, options) => {
      const validTypes = ['module', 'service', 'router', 'schema'];
      if (!type || !validTypes.includes(type)) {
        console.error(
          `Unknown generate type: ${type ?? '(none)'}. Valid types: ${validTypes.join(', ')}`,
        );
        process.exit(1);
      }

      // Handle traditional generate types
      const result = generateAction({
        type,
        name: name || '',
        module: options.module,
        sourceDir: options.sourceDir,
        dryRun: options.dryRun,
      });

      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
    });

  program
    .command('codegen')
    .description('Generate SDK and CLI clients from the compiled API')
    .option('--dry-run', 'Preview generated files without writing')
    .option('--output <dir>', 'Output directory')
    .action(async (opts: { dryRun?: boolean; output?: string }) => {
      const { resolve, dirname } = await import('node:path');
      const { mkdir, writeFile: fsWriteFile } = await import('node:fs/promises');

      // Try to load vertz.config.ts for codegen + compiler config
      let config: CodegenConfig | undefined;
      let compilerConfig: import('@vertz/compiler').VertzConfig | undefined;
      try {
        const configPath = resolve(process.cwd(), 'vertz.config.ts');
        const jiti = createJiti(import.meta.url);
        const configModule = (await jiti.import(configPath)) as Record<string, unknown>;
        // Named export: export const codegen = { ... }
        // Or nested in default: export default { codegen: { ... } }
        config =
          (configModule.codegen as CodegenConfig) ??
          ((configModule.default as Record<string, unknown>)?.codegen as CodegenConfig);
        // Default export is the compiler config (from defineConfig())
        compilerConfig = configModule.default as import('@vertz/compiler').VertzConfig;
      } catch {
        // Config may not exist — codegenAction handles missing config
      }

      // Compile the app to get AppIR, then convert to CodegenIR
      let ir: CodegenIR;
      try {
        const { createCompiler } = await import('@vertz/compiler');
        const compiler = createCompiler(compilerConfig);
        const result = await compiler.compile();
        if (!result.success) {
          console.error('Compilation failed with errors.');
          process.exit(1);
        }
        const { adaptIR } = await import('@vertz/codegen');
        ir = adaptIR(result.ir);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to compile app: ${message}`);
        process.exit(1);
      }

      // Create pipeline and writeFile helper
      const { createCodegenPipeline } = await import('@vertz/codegen');
      const pipeline = createCodegenPipeline();

      const writeFile = async (path: string, content: string) => {
        await mkdir(dirname(path), { recursive: true });
        await fsWriteFile(path, content, 'utf-8');
      };

      const result = await codegenAction({
        config,
        ir,
        writeFile,
        pipeline,
        dryRun: opts.dryRun,
      });

      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }

      console.log(result.data.output);
    });

  program
    .command('routes')
    .description('Display the route table')
    .option('--format <format>', 'Output format (table, json)', 'table');

  // Database commands
  const dbCommand = program.command('db').description('Database management commands');

  /** Run a db action with proper error handling and connection cleanup. */
  async function withDbContext<T>(
    fn: (ctx: DbCommandContext) => Promise<{ ok: true; data: T } | { ok: false; error: Error }>,
  ): Promise<T> {
    let ctx: DbCommandContext;
    try {
      ctx = await loadDbContext();
    } catch (error) {
      console.error(
        `Configuration error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
    try {
      const result = await fn(ctx);
      if (!result.ok) {
        console.error(`Command failed: ${result.error.message}`);
        process.exit(1);
      }
      return result.data;
    } finally {
      try {
        await ctx.close();
      } catch {
        // Connection cleanup failed — not actionable for the user
      }
    }
  }

  dbCommand
    .command('migrate')
    .description('Generate a migration file and apply it (development)')
    .option('-n, --name <name>', 'Migration name')
    .option('--dry-run', 'Preview SQL without writing or applying')
    .action(async (opts) => {
      const result = await withDbContext((ctx) =>
        dbMigrateAction({
          ctx,
          name: opts.name ?? undefined,
          dryRun: opts.dryRun ?? false,
        }),
      );
      if (result.dryRun) {
        console.log(`[dry-run] Migration file: ${result.migrationFile}`);
        console.log(result.sql || '-- no changes');
      } else {
        console.log(`Migration applied: ${result.migrationFile}`);
      }
    });

  dbCommand
    .command('push')
    .description('Push schema changes directly (no migration file)')
    .action(async () => {
      const result = await withDbContext((ctx) => dbPushAction({ ctx }));
      if (result.tablesAffected.length === 0) {
        console.log('No changes to push.');
      } else {
        console.log(`Pushed changes to: ${result.tablesAffected.join(', ')}`);
      }
    });

  dbCommand
    .command('deploy')
    .description('Apply pending migration files (production)')
    .option('--dry-run', 'Preview SQL without applying')
    .action(async (opts) => {
      const data = await withDbContext((ctx) =>
        dbDeployAction({ ctx, dryRun: opts.dryRun ?? false }),
      );
      if (data.applied.length === 0) {
        console.log('No pending migrations.');
      } else {
        const prefix = data.dryRun ? '[dry-run] Would apply' : 'Applied';
        console.log(`${prefix}: ${data.applied.join(', ')}`);
      }
    });

  dbCommand
    .command('status')
    .description('Show migration status and drift report')
    .action(async () => {
      const data = await withDbContext((ctx) => dbStatusAction({ ctx }));
      console.log(`Applied: ${data.applied.length}`);
      console.log(`Pending: ${data.pending.length}`);
      if (data.pending.length > 0) {
        for (const name of data.pending) {
          console.log(`  - ${name}`);
        }
      }

      if (data.codeChanges.length > 0) {
        console.log('\nCode changes:');
        for (const c of data.codeChanges) {
          console.log(`  - ${c.description}`);
        }
      }

      if (data.drift.length > 0) {
        console.log('\nDrift detected:');
        for (const d of data.drift) {
          console.log(`  - ${d.description}`);
        }
      }

      if (data.codeChanges.length === 0 && data.drift.length === 0) {
        console.log('\nSchema is in sync.');
      }
    });

  dbCommand
    .command('reset')
    .description('Drop all tables and re-apply migrations')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (opts) => {
      if (!opts.force) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question(
            'This will drop all tables and re-apply migrations. Continue? (y/N) ',
            resolve,
          );
        });
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('Aborted.');
          return;
        }
      }
      const data = await withDbContext((ctx) => dbResetAction({ ctx }));
      console.log(`Dropped: ${data.tablesDropped.length} table(s)`);
      console.log(`Applied: ${data.migrationsApplied.length} migration(s)`);
    });

  dbCommand
    .command('baseline')
    .description('Mark existing database as migrated')
    .action(async () => {
      const data = await withDbContext((ctx) => dbBaselineAction({ ctx }));
      if (data.recorded.length === 0) {
        console.log('All migrations already recorded.');
      } else {
        console.log(`Recorded: ${data.recorded.join(', ')}`);
      }
    });

  return program;
}
