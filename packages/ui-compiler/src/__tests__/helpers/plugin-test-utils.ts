import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Minimal plugin shape for testing — avoids depending on bun types in typecheck. */
interface PluginLike {
  name: string;
  setup: (build: {
    onLoad: (
      opts: { filter: RegExp },
      cb: (args: { path: string }) => Promise<OnLoadResultLike>,
    ) => void;
  }) => void;
}

interface OnLoadResultLike {
  contents: string;
  loader: string;
}

/**
 * Simulates a BunPlugin's onLoad callback for testing.
 *
 * Writes source to a temp file, captures the onLoad handler registered
 * by the plugin's setup(), then invokes it with the temp file path.
 */
export async function runPluginOnLoad(
  plugin: PluginLike,
  source: string,
  filename: string,
): Promise<OnLoadResultLike> {
  let handler: ((args: { path: string }) => Promise<OnLoadResultLike>) | null = null;

  const build = {
    onLoad(_opts: { filter: RegExp }, cb: (args: { path: string }) => Promise<OnLoadResultLike>) {
      handler = cb;
    },
  };

  plugin.setup(build);

  if (!handler) {
    throw new Error('Plugin did not register an onLoad handler');
  }

  // tsc can't see the assignment inside the synchronous callback above,
  // so it narrows handler to `never` after the null guard.
  const onLoad = handler as (args: { path: string }) => Promise<OnLoadResultLike>;

  const tmpDir = await mkdtemp(join(tmpdir(), 'vertz-test-'));
  const filePath = join(tmpDir, filename);
  await writeFile(filePath, source);

  try {
    return await onLoad({ path: filePath });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
