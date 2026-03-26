/**
 * Native compiler loader — loads the Rust-based Vertz compiler via NAPI.
 *
 * The native compiler is an optional performance optimization that replaces
 * the ts-morph-based TypeScript compiler with a ~20-50x faster Rust compiler.
 * It is gated behind the VERTZ_NATIVE_COMPILER=1 environment variable.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface NativeCompileResult {
  code: string;
  css?: string;
  map?: string;
  diagnostics?: Array<{ message: string; line?: number; column?: number }>;
  components?: Array<{
    name: string;
    body_start: number;
    body_end: number;
    variables?: Array<{
      name: string;
      kind: string;
      start: number;
      end: number;
      signal_properties?: string[];
      plain_properties?: string[];
    }>;
  }>;
}

export interface NativeCompileOptions {
  filename?: string;
  fastRefresh?: boolean;
  target?: string;
}

export interface NativeCompiler {
  compile(source: string, options?: NativeCompileOptions): NativeCompileResult;
}

/**
 * Attempt to load the native Rust compiler.
 *
 * Returns the compiler if:
 * 1. VERTZ_NATIVE_COMPILER=1 is set
 * 2. The platform-specific .node binary can be loaded
 *
 * Returns null otherwise (silent fallback to ts-morph).
 */
export function tryLoadNativeCompiler(): NativeCompiler | null {
  if (process.env.VERTZ_NATIVE_COMPILER !== '1') {
    return null;
  }

  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binaryName = `vertz-compiler.${platform}-${arch}.node`;

  // Strategy 1: Try npm package resolution (production installs)
  try {
    const modulePath = require.resolve(`@vertz/native-compiler/${binaryName}`);
    return require(modulePath) as NativeCompiler;
  } catch {
    // Fall through to next strategy
  }

  // Strategy 2: Walk up from this file to find the monorepo native/ directory
  // This handles the monorepo dev setup where the native compiler isn't an npm dependency
  let dir = resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'native', 'vertz-compiler', binaryName);
    if (existsSync(candidate)) {
      try {
        return require(candidate) as NativeCompiler;
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
