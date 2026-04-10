import { join } from 'node:path';

function resolveBinaryName(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `vertz-compiler.${platform}-${arch}.node`;
}

export const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  resolveBinaryName(),
);
