import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);

const COMPILER_DEPENDENT_TESTS = new Set([
  'src/__tests__/aot-e2e-pipeline.test.ts',
  'src/__tests__/aot-manifest-build.test.ts',
  'src/__tests__/bun-plugin-onload.test.ts',
  'src/__tests__/compiler/native-compiler.test.ts',
  'src/__tests__/node-handler.test.ts',
  'src/__tests__/ssr-handler.test.ts',
  'src/__tests__/ssr-single-pass.test.ts',
  'src/__tests__/ssr-render.test.ts',
  'src/__tests__/upstream-watcher.test.ts',
  'src/__tests__/ssr-aot-manifest-dev.test.ts',
]);

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

function collectTestFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) continue;
    files.push(relative(process.cwd(), fullPath));
  }

  return files.sort();
}

function run(args: string[]): never {
  const result = spawnSync('bun', ['test', '--timeout', '60000', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

const extraArgs = process.argv.slice(2);

if (hasNativeCompilerBinary()) {
  run(extraArgs.length > 0 ? extraArgs : ['src/']);
}

if (extraArgs.length > 0) {
  console.warn(
    '[vertz] Native compiler binary not available — targeted test args requested, running them unchanged.',
  );
  run(extraArgs);
}

const selectedTests = collectTestFiles(join(process.cwd(), 'src')).filter(
  (file) => !COMPILER_DEPENDENT_TESTS.has(file),
);

console.warn(
  `[vertz] Native compiler binary not available — skipping ${COMPILER_DEPENDENT_TESTS.size} compiler-dependent ui-server test files.`,
);

run(selectedTests);
