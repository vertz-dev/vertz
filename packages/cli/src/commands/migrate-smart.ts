import { spawn } from 'node:child_process';
import { findProjectRoot } from '../utils/paths';

/**
 * Options for the smart migrate command
 */
export interface SmartMigrateOptions {
  /** Create migration file without applying */
  createOnly?: boolean;
  /** Reset the database (drop all tables) */
  reset?: boolean;
  /** Show migration status without running migrations */
  status?: boolean;
  /** Migration name (required when --create-only is used in dev) */
  name?: string;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Detect if we're in a development environment
 */
function isDevelopment(): boolean {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  return nodeEnv !== 'production' && nodeEnv !== 'ci';
}

/**
 * Get the Prisma migrate command based on environment
 */
function getPrismaCommand(
  options: SmartMigrateOptions,
  isDev: boolean,
): { cmd: string; args: string[] } {
  if (options.status) {
    return { cmd: 'npx', args: ['prisma', 'migrate', 'status'] };
  }

  if (options.createOnly) {
    if (!options.name) {
      throw new Error(
        'Migration name is required when using --create-only. Use --name <migration-name>',
      );
    }
    return {
      cmd: 'npx',
      args: ['prisma', 'migrate', 'dev', '--name', options.name, '--create-only'],
    };
  }

  if (options.reset) {
    return { cmd: 'npx', args: ['prisma', 'migrate', 'reset', '--force'] };
  }

  // Default behavior based on environment
  if (isDev) {
    return { cmd: 'npx', args: ['prisma', 'migrate', 'dev'] };
  } else {
    return { cmd: 'npx', args: ['prisma', 'migrate', 'deploy'] };
  }
}

/**
 * Run a command and return the exit code
 */
function runCommand(cmd: string, args: string[], cwd: string, verbose?: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    if (verbose) {
      console.log(`\n➡️ Running: ${cmd} ${args.join(' ')}`);
    }

    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Smart migrate action - environment-aware database migration
 *
 * In development:
 *   - Runs prisma migrate dev (applies pending + creates new migration if schema changed)
 *   - Prompts for migration name if schema changed
 *
 * In production/CI:
 *   - Runs prisma migrate deploy (applies pending only, no new migrations)
 *
 * Flags:
 *   --create-only: Create migration file without applying
 *   --reset: Reset database (drops all tables)
 *   --status: Show migration status
 *   --name <name>: Migration name (required with --create-only)
 */
export async function smartMigrateAction(options: SmartMigrateOptions = {}): Promise<void> {
  const { createOnly = false, reset = false, status = false, name, verbose = false } = options;

  // Normalize name - commander can pass null
  const migrationName = name ?? undefined;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error('Error: Could not find project root. Are you in a Vertz project?');
    process.exit(1);
  }

  // Detect environment
  const isDev = isDevelopment();
  const envLabel = isDev ? 'development' : 'production';

  console.log(`📦 Smart Migrate (${envLabel} environment)`);

  if (verbose) {
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(
      `   Options: createOnly=${createOnly}, reset=${reset}, status=${status}, name=${migrationName || 'none'}`,
    );
  }

  // Validate options
  if (createOnly && !migrationName && isDev) {
    console.error('Error: Migration name is required when using --create-only in development.');
    console.error('Usage: vertz db migrate --create-only --name <migration-name>');
    process.exit(1);
  }

  try {
    // Get the appropriate Prisma command
    const prismaOptions = { ...options, name: migrationName };
    const { cmd, args } = getPrismaCommand(prismaOptions, isDev);

    // Show what we're about to do
    if (status) {
      console.log('\n📋 Showing migration status...\n');
    } else if (createOnly) {
      console.log('\n🔧 Creating migration file (without applying)...\n');
    } else if (reset) {
      console.log('\n⚠️  Resetting database (this will drop all tables)...\n');
    } else if (isDev) {
      console.log('\n🔄 Running development migration (apply + create if schema changed)...\n');
    } else {
      console.log('\n🚀 Running production migration (apply only, no new migrations)...\n');
    }

    // Run the command
    const exitCode = await runCommand(cmd, args, projectRoot, verbose);

    if (exitCode !== 0) {
      console.error(`\n❌ Migration failed with exit code ${exitCode}`);
      process.exit(exitCode);
    }

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('\n❌ Migration error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
