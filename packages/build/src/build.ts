import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundle } from './bundle.js';
import { generateDts } from './dts.js';
import { normalizeHooks, runHooks } from './hooks.js';
import type { BuildConfig } from './types.js';

export async function build(configs: BuildConfig | BuildConfig[], cwd: string): Promise<void> {
  const configArray = Array.isArray(configs) ? configs : [configs];

  // Read package.json once for hooks context
  let packageJson: Record<string, unknown> = {};
  const pkgJsonPath = join(cwd, 'package.json');
  if (existsSync(pkgJsonPath)) {
    packageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  }

  for (const config of configArray) {
    const startTime = Date.now();
    const entryCount = config.entry.length;

    // 1. Bundle JS
    const result = await bundle(config, cwd);

    // 2. Run onSuccess hooks
    const hooks = normalizeHooks(config.onSuccess);
    if (hooks.length > 0) {
      await runHooks(hooks, {
        outputFiles: result.outputFiles,
        outDir: result.outDir,
        packageJson,
      });
    }

    // 3. Generate DTS
    await generateDts(config, cwd);

    const elapsed = Date.now() - startTime;
    const outFileCount = result.outputFiles.length;
    console.error(`  Built ${entryCount} entries → ${outFileCount} files (${elapsed}ms)`);
  }
}
