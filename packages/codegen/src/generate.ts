import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import type { ResolvedCodegenConfig } from './config';
import { formatWithBiome } from './format';
import { emitManifestFile } from './generators/typescript/emit-cli';
import { emitClientFile, emitModuleFile } from './generators/typescript/emit-client';
import {
  emitBarrelIndex,
  emitPackageJson,
  emitSchemaReExports,
} from './generators/typescript/emit-sdk';
import { emitModuleTypesFile, emitSharedTypesFile } from './generators/typescript/emit-types';
import type { IncrementalResult } from './incremental';
import { writeIncremental } from './incremental';
import { adaptIR } from './ir-adapter';
import type { CodegenIR, GeneratedFile } from './types';

// ── Result ─────────────────────────────────────────────────────────

export interface GenerateResult {
  /** The files that were generated (paths relative to outputDir). */
  files: GeneratedFile[];
  /** The CodegenIR that was derived from the AppIR. */
  ir: CodegenIR;
  /** Number of files generated. */
  fileCount: number;
  /** Which generators were run. */
  generators: string[];
  /** Incremental write stats (only present when incremental mode is used). */
  incremental?: IncrementalResult;
}

// ── TypeScript generator ───────────────────────────────────────────

function runTypescriptGenerator(ir: CodegenIR, config: ResolvedCodegenConfig): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Determine which schemas belong to which module
  const moduleSchemaNames = new Set<string>();
  for (const mod of ir.modules) {
    for (const op of mod.operations) {
      for (const ref of Object.values(op.schemaRefs)) {
        if (ref) moduleSchemaNames.add(ref);
      }
    }
  }

  // Shared schemas: those not referenced by any module operation's schemaRefs
  const sharedSchemas = ir.schemas.filter((s) => !moduleSchemaNames.has(s.name));

  // Module type files
  for (const mod of ir.modules) {
    // Get schemas referenced by this module
    const moduleRefNames = new Set<string>();
    for (const op of mod.operations) {
      for (const ref of Object.values(op.schemaRefs)) {
        if (ref) moduleRefNames.add(ref);
      }
    }
    const moduleSchemas = ir.schemas.filter((s) => moduleRefNames.has(s.name));

    files.push(emitModuleTypesFile(mod, moduleSchemas));
  }

  // Shared types file (only if there are shared schemas)
  if (sharedSchemas.length > 0) {
    files.push(emitSharedTypesFile(sharedSchemas));
  }

  // Module client files
  for (const mod of ir.modules) {
    files.push(emitModuleFile(mod));
  }

  // Client file
  files.push(emitClientFile(ir));

  // Schema re-exports
  if (ir.schemas.length > 0) {
    files.push(emitSchemaReExports(ir.schemas));
  }

  // Barrel index
  files.push(emitBarrelIndex(ir));

  // Package.json
  if (config.typescript?.publishable) {
    files.push(
      emitPackageJson(ir, {
        packageName: config.typescript.publishable.name,
        packageVersion: config.typescript.publishable.version,
      }),
    );
  }

  return files;
}

// ── CLI Generator ───────────────────────────────────────────────

function runCLIGenerator(ir: CodegenIR): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // cli/manifest.ts — command definitions
  files.push(emitManifestFile(ir));

  return files;
}

// ── Synchronous core generate (used by pipeline) ────────────────

export function generateSync(ir: CodegenIR, config: ResolvedCodegenConfig): GenerateResult {
  const files: GeneratedFile[] = [];
  const generators: string[] = [];

  for (const gen of config.generators) {
    if (gen === 'typescript') {
      generators.push('typescript');
      files.push(...runTypescriptGenerator(ir, config));
    } else if (gen === 'cli') {
      generators.push('cli');
      files.push(...runCLIGenerator(ir));
    }
  }

  return {
    files,
    ir,
    fileCount: files.length,
    generators,
  };
}

// ── Main orchestrator ──────────────────────────────────────────────

/**
 * Top-level orchestrator that ties together the full codegen pipeline:
 * 1. Converts AppIR to CodegenIR via the IR adapter
 * 2. Runs configured generators to produce GeneratedFile[]
 * 3. Optionally formats output with Biome
 * 4. Writes files to disk (incrementally when enabled)
 */
export async function generate(
  appIR: AppIR,
  config: ResolvedCodegenConfig,
): Promise<GenerateResult> {
  // Step 1: Convert AppIR → CodegenIR
  const ir = adaptIR(appIR);

  // Step 2: Run generators
  const result = generateSync(ir, config);
  let { files } = result;

  // Step 3: Format with Biome (if enabled)
  const shouldFormat = config.format !== false;
  if (shouldFormat) {
    files = await formatWithBiome(files);
  }

  // Step 4: Write files to disk
  // Incremental mode is on by default (incremental !== false)
  const useIncremental = config.incremental !== false;
  let incrementalResult: IncrementalResult | undefined;

  if (useIncremental) {
    incrementalResult = await writeIncremental(files, config.outputDir);
  } else {
    await mkdir(config.outputDir, { recursive: true });

    for (const file of files) {
      const filePath = join(config.outputDir, file.path);
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }
  }

  return {
    files,
    ir,
    fileCount: files.length,
    generators: result.generators,
    incremental: incrementalResult,
  };
}
