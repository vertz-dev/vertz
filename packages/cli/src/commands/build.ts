/**
 * Vertz Build Command - Production Build
 *
 * Dispatches to the correct build pipeline based on app type:
 * - API-only (src/server.ts): Codegen + typecheck + esbuild bundle
 * - UI-only (src/app.tsx):    Client + CSS + HTML + server SSR (Bun.build)
 * - Full-stack (both):        API build + UI build
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';
import { type DetectedApp, detectAppType } from '../dev-server/app-detector';
import { type BuildConfig, BuildOrchestrator, buildUI } from '../production-build';
import { buildForCloudflare } from '../production-build/cloudflare/build-cloudflare';
import { formatDuration, formatFileSize } from '../utils/format';
import { findProjectRoot } from '../utils/paths';

export interface BuildCommandOptions {
  strict?: boolean;
  output?: string;
  target?: 'node' | 'edge' | 'worker' | 'cloudflare';
  noTypecheck?: boolean;
  noMinify?: boolean;
  sourcemap?: boolean;
  verbose?: boolean;
}

/**
 * Run the build command
 */
export async function buildAction(options: BuildCommandOptions = {}): Promise<Result<void, Error>> {
  const {
    strict: _strict = false,
    output,
    target = 'node',
    noTypecheck = false,
    noMinify = false,
    sourcemap = false,
    verbose = false,
  } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Detect app type
  let detected: DetectedApp;
  try {
    detected = detectAppType(projectRoot);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }

  if (verbose) {
    console.log(`Detected app type: ${detected.type}`);
  }

  // Cloudflare target uses a dedicated pipeline regardless of app type
  if (target === 'cloudflare') {
    return buildForCloudflare(detected, options);
  }

  switch (detected.type) {
    case 'api-only':
      return buildApiOnly(detected, { output, target, noTypecheck, noMinify, sourcemap, verbose });
    case 'ui-only':
      return buildUIOnly(detected, { noMinify, sourcemap, verbose });
    case 'full-stack':
      return buildFullStack(detected, {
        output,
        target,
        noTypecheck,
        noMinify,
        sourcemap,
        verbose,
      });
  }
}

/**
 * Build an API-only app using the existing BuildOrchestrator (esbuild).
 */
async function buildApiOnly(
  detected: DetectedApp,
  options: {
    output?: string;
    target?: 'node' | 'edge' | 'worker' | 'cloudflare';
    noTypecheck?: boolean;
    noMinify?: boolean;
    sourcemap?: boolean;
    verbose?: boolean;
  },
): Promise<Result<void, Error>> {
  const {
    output,
    target = 'node',
    noTypecheck = false,
    noMinify = false,
    sourcemap = false,
    verbose = false,
  } = options;

  // Derive entry point relative to project root
  if (!detected.serverEntry) {
    return err(new Error('No server entry point found for API build.'));
  }
  const entryPoint = detected.serverEntry.replace(`${detected.projectRoot}/`, '');

  console.log('🚀 Starting Vertz API production build...\n');

  const buildConfig: BuildConfig = {
    sourceDir: 'src',
    outputDir: output || '.vertz/build',
    typecheck: !noTypecheck,
    minify: !noMinify,
    sourcemap: sourcemap,
    target,
    entryPoint,
  };

  if (verbose) {
    console.log('Build configuration:');
    console.log(`  Entry: ${entryPoint}`);
    console.log(`  Output: ${buildConfig.outputDir}`);
    console.log(`  Target: ${target}`);
    console.log(`  Typecheck: ${buildConfig.typecheck ? 'enabled' : 'disabled'}`);
    console.log(`  Minify: ${buildConfig.minify ? 'enabled' : 'disabled'}`);
    console.log(`  Sourcemap: ${buildConfig.sourcemap ? 'enabled' : 'disabled'}`);
    console.log('');
  }

  const orchestrator = new BuildOrchestrator(buildConfig);

  try {
    const result = await orchestrator.build();

    if (!result.success) {
      await orchestrator.dispose();
      return err(new Error(result.error));
    }

    console.log('\n📊 Build Summary:');
    console.log(`   Entry: ${result.manifest.entryPoint}`);
    console.log(`   Output: ${result.manifest.outputDir}`);
    console.log(`   Size: ${formatFileSize(result.manifest.size)}`);
    console.log(`   Time: ${formatDuration(result.durationMs)}`);
    console.log(`   Target: ${result.manifest.target}`);

    if (result.manifest.generatedFiles.length > 0) {
      console.log(`\n📁 Generated Files (${result.manifest.generatedFiles.length}):`);
      const byType = new Map<string, number>();
      for (const file of result.manifest.generatedFiles) {
        const count = byType.get(file.type) || 0;
        byType.set(file.type, count + 1);
      }
      for (const [type, count] of byType) {
        console.log(`   - ${type}: ${count} file(s)`);
      }
    }

    await orchestrator.dispose();
    return ok(undefined);
  } catch (error) {
    await orchestrator.dispose();
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Build a UI-only app using the UI build pipeline (Bun.build).
 */
async function buildUIOnly(
  detected: DetectedApp,
  options: { noMinify?: boolean; sourcemap?: boolean; verbose?: boolean },
): Promise<Result<void, Error>> {
  const { noMinify = false, sourcemap = false, verbose = false } = options;

  if (!detected.clientEntry) {
    return err(
      new Error(
        'No client entry point found (src/entry-client.ts). UI apps require a src/entry-client.ts file.',
      ),
    );
  }

  const serverEntry = detected.uiEntry ?? detected.ssrEntry;
  if (!serverEntry) {
    return err(new Error('No server entry point found (src/app.tsx or src/entry-server.ts).'));
  }

  console.log('🚀 Starting Vertz UI production build...\n');

  if (verbose) {
    console.log('Build configuration:');
    console.log(`  Client entry: ${detected.clientEntry}`);
    console.log(`  Server entry: ${serverEntry}`);
    console.log(`  Output: dist`);
    console.log(`  Minify: ${!noMinify ? 'enabled' : 'disabled'}`);
    console.log(`  Sourcemap: ${sourcemap ? 'enabled' : 'disabled'}`);
    console.log('');
  }

  // Read title and description from package.json for SEO
  let title: string | undefined;
  let description: string | undefined;
  try {
    const pkgPath = resolve(detected.projectRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    title = pkg.vertz?.title ?? pkg.title;
    description = pkg.vertz?.description ?? pkg.description;
  } catch {
    // Ignore — defaults will be used
  }

  const result = await buildUI({
    projectRoot: detected.projectRoot,
    clientEntry: detected.clientEntry,
    serverEntry,
    outputDir: 'dist',
    minify: !noMinify,
    sourcemap,
    title,
    description,
  });

  if (!result.success) {
    return err(new Error(result.error));
  }

  console.log(`\n📊 Build completed in ${formatDuration(result.durationMs)}`);
  return ok(undefined);
}

/**
 * Build a full-stack app: API build + UI build.
 */
async function buildFullStack(
  detected: DetectedApp,
  options: {
    output?: string;
    target?: 'node' | 'edge' | 'worker' | 'cloudflare';
    noTypecheck?: boolean;
    noMinify?: boolean;
    sourcemap?: boolean;
    verbose?: boolean;
  },
): Promise<Result<void, Error>> {
  const { noMinify = false, sourcemap = false, verbose = false } = options;

  console.log('🚀 Starting Vertz full-stack production build...\n');

  // Step 1: API build (codegen + typecheck + esbuild)
  if (detected.serverEntry) {
    console.log('── API Build ──────────────────────────────────────\n');
    const apiResult = await buildApiOnly(detected, options);
    if (!apiResult.ok) {
      return apiResult;
    }
    console.log('');
  }

  // Step 2: UI build (client + server SSR)
  if (detected.clientEntry && (detected.uiEntry ?? detected.ssrEntry)) {
    console.log('── UI Build ───────────────────────────────────────\n');
    const uiResult = await buildUIOnly(detected, { noMinify, sourcemap, verbose });
    if (!uiResult.ok) {
      return uiResult;
    }
  }

  console.log('\n✅ Full-stack build complete!');
  return ok(undefined);
}
