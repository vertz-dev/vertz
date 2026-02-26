/**
 * Vertz Build Command - Production Build
 *
 * Dispatches to the correct build pipeline based on app type:
 * - API-only (src/server.ts): Codegen + typecheck + esbuild bundle
 * - UI-only (src/app.tsx):    Client + CSS + HTML + server SSR (Bun.build)
 * - Full-stack (both):        API build + UI build
 */

import { type DetectedApp, detectAppType } from '../dev-server/app-detector';
import { type BuildConfig, BuildOrchestrator, buildUI } from '../production-build';
import { formatDuration, formatFileSize } from '../utils/format';
import { findProjectRoot } from '../utils/paths';

export interface BuildCommandOptions {
  strict?: boolean;
  output?: string;
  target?: 'node' | 'edge' | 'worker';
  noTypecheck?: boolean;
  noMinify?: boolean;
  sourcemap?: boolean;
  verbose?: boolean;
}

/**
 * Run the build command
 * @returns Exit code (0 for success, 1 for failure)
 */
export async function buildAction(options: BuildCommandOptions = {}): Promise<number> {
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
    console.error('Error: Could not find project root. Are you in a Vertz project?');
    return 1;
  }

  // Detect app type
  let detected: DetectedApp;
  try {
    detected = detectAppType(projectRoot);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (verbose) {
    console.log(`Detected app type: ${detected.type}`);
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
    target?: 'node' | 'edge' | 'worker';
    noTypecheck?: boolean;
    noMinify?: boolean;
    sourcemap?: boolean;
    verbose?: boolean;
  },
): Promise<number> {
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
    console.error('Error: No server entry point found for API build.');
    return 1;
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
      console.error('\n❌ Build failed:');
      console.error(`   ${result.error}`);
      await orchestrator.dispose();
      return 1;
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
    return 0;
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    await orchestrator.dispose();
    return 1;
  }
}

/**
 * Build a UI-only app using the UI build pipeline (Bun.build).
 */
async function buildUIOnly(
  detected: DetectedApp,
  options: { noMinify?: boolean; sourcemap?: boolean; verbose?: boolean },
): Promise<number> {
  const { noMinify = false, sourcemap = false, verbose = false } = options;

  if (!detected.clientEntry) {
    console.error('Error: No client entry point found (src/entry-client.ts).');
    console.error('UI apps require a src/entry-client.ts file.');
    return 1;
  }

  const serverEntry = detected.uiEntry ?? detected.ssrEntry;
  if (!serverEntry) {
    console.error('Error: No server entry point found (src/app.tsx or src/entry-server.ts).');
    return 1;
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

  const result = await buildUI({
    projectRoot: detected.projectRoot,
    clientEntry: detected.clientEntry,
    serverEntry,
    outputDir: 'dist',
    minify: !noMinify,
    sourcemap,
  });

  if (!result.success) {
    console.error('\n❌ Build failed:');
    console.error(`   ${result.error}`);
    return 1;
  }

  console.log(`\n📊 Build completed in ${formatDuration(result.durationMs)}`);
  return 0;
}

/**
 * Build a full-stack app: API build + UI build.
 */
async function buildFullStack(
  detected: DetectedApp,
  options: {
    output?: string;
    target?: 'node' | 'edge' | 'worker';
    noTypecheck?: boolean;
    noMinify?: boolean;
    sourcemap?: boolean;
    verbose?: boolean;
  },
): Promise<number> {
  const { noMinify = false, sourcemap = false, verbose = false } = options;

  console.log('🚀 Starting Vertz full-stack production build...\n');

  // Step 1: API build (codegen + typecheck + esbuild)
  if (detected.serverEntry) {
    console.log('── API Build ──────────────────────────────────────\n');
    const apiResult = await buildApiOnly(detected, options);
    if (apiResult !== 0) {
      return apiResult;
    }
    console.log('');
  }

  // Step 2: UI build (client + server SSR)
  if (detected.clientEntry && (detected.uiEntry ?? detected.ssrEntry)) {
    console.log('── UI Build ───────────────────────────────────────\n');
    const uiResult = await buildUIOnly(detected, { noMinify, sourcemap, verbose });
    if (uiResult !== 0) {
      return uiResult;
    }
  }

  console.log('\n✅ Full-stack build complete!');
  return 0;
}
