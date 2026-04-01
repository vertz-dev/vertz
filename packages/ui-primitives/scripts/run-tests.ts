import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);

const COMPILER_DEPENDENT_TESTS = new Set([
  'src/__tests__/breadcrumb-composed.test.tsx',
  'src/__tests__/hydration-composed.test.ts',
  'src/accordion/__tests__/accordion-hydration.test.ts',
  'src/calendar/__tests__/calendar-composed.test.ts',
  'src/carousel/__tests__/carousel-composed.test.ts',
  'src/checkbox/__tests__/checkbox-composed.test.ts',
  'src/checkbox/__tests__/checkbox.test.ts',
  'src/collapsible/__tests__/collapsible-composed.test.ts',
  'src/date-picker/__tests__/date-picker-composed.test.ts',
  'src/list/__tests__/list-animation-hooks.test.tsx',
  'src/list/__tests__/list-drag.test.tsx',
  'src/radio/__tests__/radio-composed.test.ts',
  'src/resizable-panel/__tests__/resizable-panel-composed.test.ts',
  'src/switch/__tests__/switch-composed.test.ts',
  'src/switch/__tests__/switch.test.ts',
  'src/tabs/__tests__/tabs-composed.test.ts',
  'src/toggle-group/__tests__/toggle-group-composed.test.ts',
  'src/toggle/__tests__/toggle-composed.test.ts',
  'src/toggle/__tests__/toggle.test.ts',
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
  const result = spawnSync('bun', ['test', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

const extraArgs = process.argv.slice(2);

if (hasNativeCompilerBinary()) {
  run(extraArgs);
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
  `[vertz] Native compiler binary not available — skipping ${COMPILER_DEPENDENT_TESTS.size} compiler-dependent ui-primitives test files.`,
);

run(selectedTests);
