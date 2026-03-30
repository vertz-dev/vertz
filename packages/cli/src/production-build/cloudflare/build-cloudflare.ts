/**
 * buildForCloudflare — orchestrates the Cloudflare Workers build pipeline
 *
 * Steps:
 * 1. Run codegen pipeline (types, routes, OpenAPI)
 * 2. Analyze entities via EntityAnalyzer
 * 3. Validate access rules (missing = hard error)
 * 4. Generate deployment manifest
 * 5. Generate worker entry point
 * 6. Generate wrangler.toml
 * 7. Bundle with esbuild (platform: neutral, all @vertz/* bundled)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createCompiler, type EntityIR } from '@vertz/compiler';
import { err, ok, type Result } from '@vertz/errors';
import * as esbuild from 'esbuild';
import type { DetectedApp } from '../../dev-server/app-detector';
import { formatDuration, formatFileSize } from '../../utils/format';
import type { BuildCommandOptions } from '../../commands/build';
import { ManifestBuilder } from './manifest-builder';
import { validateAccessRules } from './validate-access-rules';
import { WorkerEntryGenerator } from './worker-entry-generator';
import { WranglerConfigGenerator } from './wrangler-config-generator';

const WORKER_OUTPUT_DIR = '.vertz/build/worker';

export async function buildForCloudflare(
  detected: DetectedApp,
  options: BuildCommandOptions,
): Promise<Result<void, Error>> {
  const { noMinify = false, sourcemap = false, verbose = false } = options;
  const startTime = performance.now();

  console.log('🚀 Starting Vertz Cloudflare Workers build...\n');

  // Step 1: Analyze entities via compiler
  console.log('📦 Analyzing entities...');
  const entities = await analyzeEntities(detected, verbose);
  if (!entities.ok) {
    return entities;
  }

  if (entities.data.length === 0) {
    return err(
      new Error('No entities found. Cloudflare Workers build requires at least one entity.'),
    );
  }

  if (verbose) {
    console.log(
      `   Found ${entities.data.length} entity(s): ${entities.data.map((e: EntityIR) => e.name).join(', ')}`,
    );
  }

  // Step 2: Validate access rules
  console.log('🔒 Validating access rules...');
  const accessErrors = validateAccessRules(entities.data);
  if (accessErrors.length > 0) {
    const msg = [
      'Build failed: missing access rules for production deployment.',
      '',
      ...accessErrors.map((e) => `  - ${e}`),
      '',
      'Define access rules for all entity operations or use rules.public for open access.',
    ].join('\n');
    return err(new Error(msg));
  }

  // Step 3: Generate manifest
  console.log('📋 Generating deployment manifest...');
  const builder = new ManifestBuilder(entities.data);
  const manifest = builder.build();

  // Set SSR and assets info based on app type
  if (detected.type === 'full-stack' || detected.type === 'ui-only') {
    manifest.ssr.enabled = true;
    manifest.assets.hasClient = true;
    manifest.assets.clientDir = 'dist/client';
  }

  // Step 4: Generate worker entry
  console.log('⚙️  Generating worker entry...');
  const serverEntry = detected.serverEntry
    ? detected.serverEntry.replace(`${detected.projectRoot}/`, '')
    : undefined;
  const entryGenerator = new WorkerEntryGenerator(entities.data, WORKER_OUTPUT_DIR, {
    serverEntry,
  });
  const entryCode = entryGenerator.generate();

  // Step 5: Generate wrangler config
  const workerName = resolveWorkerName(detected.projectRoot);
  const wranglerGenerator = new WranglerConfigGenerator(manifest, workerName);
  const wranglerToml = wranglerGenerator.generate();

  // Step 6: Write files
  mkdirSync(WORKER_OUTPUT_DIR, { recursive: true });

  const entryPath = join(WORKER_OUTPUT_DIR, '_entry.ts');
  writeFileSync(entryPath, entryCode);

  writeFileSync(join(WORKER_OUTPUT_DIR, 'wrangler.toml'), wranglerToml);
  writeFileSync(join(WORKER_OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Step 7: Bundle with esbuild
  console.log('📦 Bundling for Cloudflare Workers...');
  const bundleResult = await bundleForWorkers(entryPath, {
    minify: !noMinify,
    sourcemap,
  });
  if (!bundleResult.ok) {
    return bundleResult;
  }

  const durationMs = performance.now() - startTime;

  console.log('\n✅ Cloudflare Workers build complete!');
  console.log(`   Output: ${WORKER_OUTPUT_DIR}/`);
  console.log(`   Entities: ${entities.data.length}`);
  console.log(`   Routes: ${manifest.routes.length}`);
  console.log(`   Bundle: ${formatFileSize(bundleResult.data)}`);
  console.log(`   Time: ${formatDuration(durationMs)}`);
  console.log(`\n   Deploy with: vertz deploy`);

  return ok(undefined);
}

async function analyzeEntities(
  detected: DetectedApp,
  verbose: boolean,
): Promise<Result<EntityIR[], Error>> {
  try {
    const compiler = createCompiler({
      strict: false,
      forceGenerate: false,
      compiler: {
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        entryFile: detected.serverEntry
          ? detected.serverEntry.replace(`${detected.projectRoot}/`, '')
          : 'src/server.ts',
        schemas: { enforceNaming: true, enforcePlacement: true },
        openapi: {
          output: '.vertz/generated/openapi.json',
          info: { title: 'Vertz App', version: '1.0.0' },
        },
        validation: {
          requireResponseSchema: false,
          detectDeadCode: false,
        },
      },
    });

    const ir = await compiler.analyze();

    if (verbose && ir.diagnostics.length > 0) {
      const errors = ir.diagnostics.filter((d: { severity: string }) => d.severity === 'error');
      if (errors.length > 0) {
        console.warn(`   ${errors.length} analysis error(s) found`);
      }
    }

    return ok(ir.entities);
  } catch (error) {
    return err(
      new Error(
        `Entity analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

async function bundleForWorkers(
  entryPath: string,
  options: { minify: boolean; sourcemap: boolean },
): Promise<Result<number, Error>> {
  try {
    const outfile = join(WORKER_OUTPUT_DIR, 'index.js');

    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      outfile,
      target: 'es2022',
      conditions: ['workerd', 'worker', 'browser'],
      minify: options.minify,
      sourcemap: options.sourcemap,
      external: ['better-sqlite3', 'bun:*'],
      treeShaking: true,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      logLevel: 'warning',
    });

    const { statSync } = await import('node:fs');
    const size = existsSync(outfile) ? statSync(outfile).size : 0;
    return ok(size);
  } catch (error) {
    return err(
      new Error(`Bundle failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}

function resolveWorkerName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    // Use package name, stripping scope prefix
    const name = (pkg.name as string) ?? '';
    return name.replace(/^@[^/]+\//, '') || basename(projectRoot);
  } catch {
    return basename(projectRoot);
  }
}
