import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** Commands supported by the native runtime. Others fall back to Bun. */
export const NATIVE_RUNTIME_COMMANDS: Set<string> = new Set(['dev', 'test']);

export interface RuntimeLaunchOptions {
  port?: number;
  host?: string;
  typecheck?: boolean;
  open?: boolean;
}

/**
 * Find the vertz-runtime binary. Search order:
 * 1. VERTZ_RUNTIME_BINARY env var (fail-fast if set but missing)
 * 2. @vertz/runtime npm package (getBinaryPath — single source of truth)
 * 3. native/target/release/vertz-runtime (local cargo build, monorepo dev only)
 * 4. native/target/debug/vertz-runtime (local cargo build, monorepo dev only)
 */
export function findRuntimeBinary(projectRoot: string): string | null {
  // 1. Explicit env override — fail-fast if set but missing
  const envPath = process.env.VERTZ_RUNTIME_BINARY;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(
        `VERTZ_RUNTIME_BINARY is set to '${envPath}' but the file does not exist. ` +
          `Remove VERTZ_RUNTIME_BINARY to use automatic resolution.`,
      );
    }
    return envPath;
  }

  // 2. npm-installed platform package (single source of truth)
  try {
    const { getBinaryPath } = require('@vertz/runtime') as {
      getBinaryPath: () => string;
    };
    return getBinaryPath();
  } catch {
    // Package not installed or platform not supported — fall through
  }

  // 3. Local cargo build (monorepo dev only)
  const release = join(projectRoot, 'native', 'target', 'release', 'vertz-runtime');
  if (existsSync(release)) return release;

  const debug = join(projectRoot, 'native', 'target', 'debug', 'vertz-runtime');
  if (existsSync(debug)) return debug;

  return null;
}

/**
 * Check version compatibility between CLI and runtime binary.
 * Returns a warning message if versions don't match, or null if they match.
 */
export function checkVersionCompatibility(binaryPath: string, cliVersion: string): string | null {
  let runtimeVersion: string;
  try {
    runtimeVersion = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    // Output may be "vertz-runtime X.Y.Z" — extract the version
    const parts = runtimeVersion.split(/\s+/);
    runtimeVersion = parts[parts.length - 1] ?? runtimeVersion;
  } catch {
    // Can't determine version — skip check silently
    return null;
  }

  if (runtimeVersion === cliVersion) return null;

  const updatePkg = isNewerSemver(cliVersion, runtimeVersion) ? '@vertz/runtime' : '@vertz/cli';
  return (
    `[vertz] Warning: CLI version ${cliVersion} but runtime version ${runtimeVersion}.\n` +
    `Run 'npm update ${updatePkg}' to sync versions.`
  );
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
 * Compare two semver version strings. Returns true if `a` is newer than `b`.
 */
export function isNewerSemver(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
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
