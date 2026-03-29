import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RuntimeLaunchOptions {
  port?: number;
  host?: string;
  typecheck?: boolean;
  open?: boolean;
}

/**
 * Find the vertz-runtime binary. Search order:
 * 1. VERTZ_RUNTIME_BINARY env var (explicit override)
 * 2. native/target/release/vertz-runtime (release build)
 * 3. native/target/debug/vertz-runtime (debug build)
 */
export function findRuntimeBinary(projectRoot: string): string | null {
  // 1. Env override
  const envPath = process.env.VERTZ_RUNTIME_BINARY;
  if (envPath) {
    return existsSync(envPath) ? envPath : null;
  }

  // 2. Release build
  const releasePath = join(projectRoot, 'native', 'target', 'release', 'vertz-runtime');
  if (existsSync(releasePath)) return releasePath;

  // 3. Debug build
  const debugPath = join(projectRoot, 'native', 'target', 'debug', 'vertz-runtime');
  if (existsSync(debugPath)) return debugPath;

  return null;
}

/**
 * Build the CLI arguments for the vertz-runtime binary's `dev` subcommand.
 */
export function buildRuntimeArgs(opts: RuntimeLaunchOptions): string[] {
  const port = opts.port ?? 3000;
  const host = opts.host ?? 'localhost';

  const args = ['dev', '--port', String(port), '--host', host];

  if (opts.typecheck === false) {
    args.push('--no-typecheck');
  }

  if (opts.open) {
    args.push('--open');
  }

  return args;
}

/**
 * Spawn the Rust runtime binary as a subprocess.
 * Inherits stdio for full terminal passthrough.
 */
export function launchRuntime(binaryPath: string, opts: RuntimeLaunchOptions): ChildProcess {
  const args = buildRuntimeArgs(opts);

  return spawn(binaryPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
}
