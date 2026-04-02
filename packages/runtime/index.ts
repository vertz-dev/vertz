import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export function getBinaryPath(): string {
  const pkg = `@vertz/runtime-${process.platform}-${process.arch}`;
  let pkgDir: string;
  try {
    pkgDir = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    throw new Error(
      `No Vertz runtime binary available for ${process.platform}-${process.arch}.\n` +
        `Expected package: ${pkg}\n\n` +
        `If your platform is supported, try: npm install @vertz/runtime\n` +
        `If your platform is not supported, build from source: cd native && cargo build --release\n\n` +
        `Supported platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64\n` +
        `See: https://vertz.dev/docs/runtime`,
    );
  }
  const binaryPath = join(pkgDir, 'vtz');
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Vertz runtime package ${pkg} is installed but the binary is missing at ${binaryPath}.\n` +
        `The package may be corrupted or incompletely installed.\n\n` +
        `Try: npm rebuild ${pkg}`,
    );
  }
  return binaryPath;
}
