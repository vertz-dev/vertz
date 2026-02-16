/**
 * Build Orchestrator - Production Build Pipeline
 *
 * Coordinates the full production build:
 * 1. Codegen - runs the pipeline to generate types, routes, OpenAPI
 * 2. Typecheck - runs TypeScript compiler
 * 3. Bundle - uses Bun/esbuild to create production bundle
 * 4. Manifest - generates build manifest
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCompiler } from '@vertz/compiler';
import * as esbuild from 'esbuild';
import { PipelineOrchestrator } from '../pipeline';
import { formatDuration, formatFileSize } from '../utils/format';
import { defaultBuildConfig } from './types';
/**
 * Build Orchestrator
 *
 * Coordinates the full production build pipeline
 */
export class BuildOrchestrator {
  config;
  pipeline;
  compiler = null;
  constructor(config = {}) {
    this.config = { ...defaultBuildConfig, ...config };
    // Create the underlying pipeline orchestrator
    const pipelineConfig = {
      sourceDir: this.config.sourceDir,
      outputDir: '.vertz/generated',
      typecheck: this.config.typecheck,
      autoSyncDb: false, // Don't auto-sync in build
      port: 3000,
      host: 'localhost',
    };
    this.pipeline = new PipelineOrchestrator(pipelineConfig);
  }
  /**
   * Run the full production build
   */
  async build() {
    const startTime = performance.now();
    const stages = {
      codegen: false,
      typecheck: false,
      bundle: false,
    };
    const manifest = {
      entryPoint: this.config.entryPoint,
      outputDir: this.config.outputDir,
      generatedFiles: [],
      size: 0,
      buildTime: Date.now(),
      target: this.config.target,
    };
    try {
      // Stage 1: Run codegen pipeline
      console.log('📦 Running codegen pipeline...');
      const codegenResult = await this.runCodegen();
      stages.codegen = codegenResult.success;
      if (!codegenResult.success) {
        return this.createFailureResult(
          stages,
          manifest,
          startTime,
          `Codegen failed: ${codegenResult.stages.map((s) => s.error?.message).join(', ')}`,
        );
      }
      // Collect generated files for manifest
      manifest.generatedFiles = this.collectGeneratedFiles();
      // Stage 2: TypeScript type checking
      if (this.config.typecheck) {
        console.log('🔍 Running TypeScript type checking...');
        const typecheckResult = await this.runTypecheck();
        stages.typecheck = typecheckResult;
        if (!typecheckResult) {
          return this.createFailureResult(stages, manifest, startTime, 'Type checking failed');
        }
      }
      // Stage 3: Bundle the application
      console.log('📦 Bundling application...');
      const bundleResult = await this.runBundle();
      stages.bundle = bundleResult.success;
      if (!bundleResult.success) {
        return this.createFailureResult(
          stages,
          manifest,
          startTime,
          bundleResult.error || 'Bundling failed',
        );
      }
      // Update manifest with bundle info
      manifest.size = bundleResult.size || 0;
      manifest.dependencies = bundleResult.dependencies;
      manifest.treeShaken = bundleResult.treeShaken;
      // Generate manifest file
      await this.writeManifest(manifest);
      const durationMs = performance.now() - startTime;
      console.log('\n✅ Build completed successfully!');
      console.log(`   Output: ${this.config.outputDir}`);
      console.log(`   Size: ${formatFileSize(manifest.size)}`);
      console.log(`   Time: ${formatDuration(durationMs)}`);
      return {
        success: true,
        stages,
        manifest,
        durationMs,
      };
    } catch (error) {
      return this.createFailureResult(
        stages,
        manifest,
        startTime,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  /**
   * Run the codegen pipeline
   */
  async runCodegen() {
    return this.pipeline.runFull();
  }
  /**
   * Run TypeScript type checking
   */
  async runTypecheck() {
    try {
      // Initialize compiler if needed
      if (!this.compiler) {
        this.compiler = createCompiler({
          strict: false,
          forceGenerate: false,
          compiler: {
            sourceDir: this.config.sourceDir,
            outputDir: '.vertz/generated',
            entryFile: this.config.entryPoint,
            schemas: {
              enforceNaming: true,
              enforcePlacement: true,
            },
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
      }
      const ir = await this.compiler.analyze();
      const diagnostics = await this.compiler.validate(ir);
      const hasErrors = diagnostics.some((d) => d.severity === 'error');
      if (hasErrors) {
        const errors = diagnostics.filter((d) => d.severity === 'error');
        console.error(`\n❌ Type checking found ${errors.length} error(s):`);
        errors.forEach((d) => {
          console.error(`   ${d.file || 'unknown'}:${d.line}:${d.column} - ${d.message}`);
        });
        return false;
      }
      const warnings = diagnostics.filter((d) => d.severity === 'warning');
      if (warnings.length > 0) {
        console.log(`⚠️  Type checking found ${warnings.length} warning(s)`);
      }
      return true;
    } catch (error) {
      console.error('Type checking error:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  /**
   * Bundle the application using esbuild JavaScript API
   */
  async runBundle() {
    try {
      // Ensure output directory exists
      if (!existsSync(this.config.outputDir)) {
        mkdirSync(this.config.outputDir, { recursive: true });
      }
      const entryFile = join(process.cwd(), this.config.entryPoint);
      const outfile = join(this.config.outputDir, 'index.js');
      // Build using esbuild JavaScript API - safer and more reliable than shell execution
      const buildResult = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        target: this.getEsbuildTarget(),
        minify: this.config.minify,
        sourcemap: this.config.sourcemap,
        external: ['@vertz/*', '@anthropic-ai/sdk'],
        logLevel: 'info',
        metafile: true, // Enable metafile for analysis
      });
      // Calculate bundle size
      let size = 0;
      if (existsSync(outfile)) {
        size = statSync(outfile).size;
      }
      // Extract dependencies and tree-shaken modules from metafile
      const dependencies = [];
      const treeShaken = [];
      if (buildResult.metafile) {
        const outputs = buildResult.metafile.outputs;
        for (const [_path, info] of Object.entries(outputs)) {
          // Collect inputs (dependencies)
          for (const inputPath of Object.keys(info.inputs)) {
            if (!dependencies.includes(inputPath)) {
              dependencies.push(inputPath);
            }
          }
        }
      }
      return {
        success: true,
        size,
        dependencies,
        treeShaken,
      };
    } catch (error) {
      // Don't fall back to file copy - a failed build MUST fail
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  /**
   * Get esbuild target string
   */
  getEsbuildTarget() {
    switch (this.config.target) {
      case 'edge':
        return 'edge88';
      case 'worker':
        return 'esnext';
      default:
        return 'node18';
    }
  }
  /**
   * Collect generated files for manifest
   */
  collectGeneratedFiles() {
    const generatedDir = '.vertz/generated';
    const files = [];
    if (!existsSync(generatedDir)) {
      return files;
    }
    const collectRecursive = (dir, basePath = '') => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relativePath = join(basePath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          collectRecursive(fullPath, relativePath);
        } else if (stat.isFile()) {
          const type = this.getFileType(entry);
          files.push({
            path: relativePath,
            size: stat.size,
            type,
          });
        }
      }
    };
    try {
      collectRecursive(generatedDir);
    } catch {
      // Directory might not exist or be readable
    }
    return files;
  }
  /**
   * Determine file type from filename
   */
  getFileType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('types') || lower.includes('.d.ts')) return 'type';
    if (lower.includes('routes') || lower.includes('router')) return 'route';
    if (lower.includes('openapi') || lower.includes('swagger')) return 'openapi';
    if (lower.includes('client') || lower.includes('sdk')) return 'client';
    return 'type';
  }
  /**
   * Write manifest to file
   */
  async writeManifest(manifest) {
    const manifestPath = join(this.config.outputDir, 'manifest.json');
    const manifestData = {
      ...manifest,
      generatedFiles: manifest.generatedFiles.map((f) => ({
        ...f,
        // Convert backslashes to forward slashes for cross-platform compatibility
        path: f.path.replace(/\\/g, '/'),
      })),
    };
    writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
    console.log(`   Manifest: ${manifestPath}`);
  }
  /**
   * Create a failure result
   */
  createFailureResult(stages, manifest, startTime, error) {
    return {
      success: false,
      stages,
      manifest,
      error,
      durationMs: performance.now() - startTime,
    };
  }
  /**
   * Clean up resources
   */
  async dispose() {
    await this.pipeline.dispose();
    this.compiler = null;
  }
}
/**
 * Create a new build orchestrator
 */
export function createBuildOrchestrator(config) {
  return new BuildOrchestrator(config);
}
//# sourceMappingURL=orchestrator.js.map
