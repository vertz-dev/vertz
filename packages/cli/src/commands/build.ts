/**
 * Vertz Build Command - Production Build
 *
 * Production build command that orchestrates:
 * 1. Codegen - runs the full pipeline to generate types, routes, OpenAPI
 * 2. Typecheck - runs TypeScript compiler for type checking
 * 3. Bundle - bundles the server for production (esbuild)
 * 4. Manifest - generates build manifest for vertz publish
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type BuildConfig, BuildOrchestrator } from '../production-build';
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

  // Check for entry point
  const entryPoint = 'src/app.ts';
  const entryPath = join(projectRoot, entryPoint);
  if (!existsSync(entryPath)) {
    console.error(`Error: Entry point not found at ${entryPoint}`);
    console.error('Make sure you have an app.ts in your src directory.');
    return 1;
  }

  console.log('🚀 Starting Vertz production build...\n');

  // Configure the build
  const buildConfig: BuildConfig = {
    sourceDir: 'src',
    outputDir: output || '.vertz/build',
    typecheck: !noTypecheck,
    minify: !noMinify,
    sourcemap,
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

  // Create and run the build orchestrator
  const orchestrator = new BuildOrchestrator(buildConfig);

  try {
    const result = await orchestrator.build();

    if (!result.success) {
      console.error('\n❌ Build failed:');
      console.error(`   ${result.error}`);
      await orchestrator.dispose();
      return 1;
    }

    // Print summary
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
