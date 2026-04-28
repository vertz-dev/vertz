import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { resolveExternals } from './externals.js';
import type { BuildConfig, OutputFileInfo } from './types.js';
import { assertOutputsUnderOutDir } from './validate.js';

export interface BundleResult {
  outputFiles: OutputFileInfo[];
  outDir: string;
}

function resolveTarget(target: BuildConfig['target']): string | undefined {
  switch (target) {
    case 'browser':
      return 'es2020';
    case 'node':
      return 'node18';
    case 'neutral':
    default:
      return 'esnext';
  }
}

function resolveBanner(banner: BuildConfig['banner']): esbuild.BuildOptions['banner'] {
  if (!banner) return undefined;
  if (typeof banner === 'string') return { js: banner };
  return banner;
}

export async function bundle(config: BuildConfig, cwd: string): Promise<BundleResult> {
  const outDir = join(cwd, config.outDir ?? 'dist');

  if (config.clean && existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }

  // Read package.json for auto-external
  let packageJson: Record<string, unknown> = {};
  const pkgJsonPath = join(cwd, 'package.json');
  if (existsSync(pkgJsonPath)) {
    packageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  }

  const external = resolveExternals(packageJson, config.external);

  // Always externalize node builtins — esbuild's neutral platform doesn't auto-externalize them
  if (config.target !== 'browser') {
    external.push('node:*');
  }

  // Resolve entry points to absolute paths up front so an unexpected
  // `process.cwd()` inside esbuild can never re-anchor them (#2953).
  const entryPoints = config.entry.map((e) => (isAbsolute(e) ? e : resolve(cwd, e)));

  const result = await esbuild.build({
    entryPoints,
    bundle: true,
    format: 'esm',
    outdir: outDir,
    splitting: config.entry.length > 1,
    target: resolveTarget(config.target),
    platform:
      config.target === 'node' ? 'node' : config.target === 'browser' ? 'browser' : 'neutral',
    external,
    plugins: config.plugins,
    banner: resolveBanner(config.banner),
    sourcemap: true,
    metafile: true,
    write: true,
    mainFields: ['module', 'main'],
    absWorkingDir: cwd,
  });

  const outputFiles: OutputFileInfo[] = [];

  if (result.metafile) {
    for (const [outputPath, meta] of Object.entries(result.metafile.outputs)) {
      if (!outputPath.endsWith('.js')) continue;

      const fullPath = isAbsolute(outputPath) ? outputPath : resolve(cwd, outputPath);
      const relativePath = relative(outDir, fullPath);
      const size = existsSync(fullPath) ? statSync(fullPath).size : 0;

      outputFiles.push({
        path: fullPath,
        relativePath,
        entrypoint: meta.entryPoint,
        kind: meta.entryPoint ? 'entry-point' : 'chunk',
        size,
      });
    }
  }

  // Final safety net: if any output landed outside outDir, fail loudly
  // instead of letting it silently overwrite a sibling package (#2953).
  assertOutputsUnderOutDir(outputFiles, outDir);

  return { outputFiles, outDir };
}
