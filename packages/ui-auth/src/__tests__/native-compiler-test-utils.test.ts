import { it } from '@vertz/test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

function resolveBinaryName(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `vertz-compiler.${platform}-${arch}.node`;
}

function hasNativeCompilerBinary(): boolean {
  try {
    const packageJsonPath = require.resolve('@vertz/native-compiler/package.json');
    return existsSync(join(dirname(packageJsonPath), resolveBinaryName()));
  } catch {
    return false;
  }
}

export const HAS_NATIVE_COMPILER_BINARY = hasNativeCompilerBinary();
export const itWithNativeCompiler = HAS_NATIVE_COMPILER_BINARY ? it : it.skip;
