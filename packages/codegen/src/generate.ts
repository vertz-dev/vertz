import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { formatWithBiome } from './format';
import { emitClientFile, emitModuleFile } from './generators/typescript/emit-client';
import {
  emitBarrelIndex,
  emitPackageJson,
  emitSchemaReExports,
} from './generators/typescript/emit-sdk';
import { emitModuleTypesFile, emitSharedTypesFile } from './generators/typescript/emit-types';
import { adaptIR } from './ir-adapter';
import type { CodegenIR, GeneratedFile } from './types';

// ── Config ─────────────────────────────────────────────────────────

export interface CodegenConfig {
  /** Absolute path to the output directory. */
  outputDir: string;
  /** Which generators to run. Currently only 'typescript' is supported. */
  generators: 'typescript'[];
  /** Package name for the generated SDK. */
  packageName: string;
  /** Package version for the generated SDK. */
  packageVersion?: string;
  /** Whether to format output with Biome. Defaults to true. */
  format?: boolean;
}

// ── Result ─────────────────────────────────────────────────────────

export interface GenerateResult {
  /** The files that were generated (paths relative to outputDir). */
  files: GeneratedFile[];
  /** The CodegenIR that was derived from the AppIR. */
  ir: CodegenIR;
}

// ── TypeScript generator ───────────────────────────────────────────

function runTypescriptGenerator(ir: CodegenIR, config: CodegenConfig): GeneratedFile[] {
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
  files.push(
    emitPackageJson(ir, {
      packageName: config.packageName,
      packageVersion: config.packageVersion,
    }),
  );

  return files;
}

// ── Main orchestrator ──────────────────────────────────────────────

/**
 * Top-level orchestrator that ties together the full codegen pipeline:
 * 1. Converts AppIR to CodegenIR via the IR adapter
 * 2. Runs configured generators to produce GeneratedFile[]
 * 3. Optionally formats output with Biome
 * 4. Writes files to disk
 */
export async function generate(appIR: AppIR, config: CodegenConfig): Promise<GenerateResult> {
  // Step 1: Convert AppIR → CodegenIR
  const ir = adaptIR(appIR);

  // Step 2: Run generators
  let files: GeneratedFile[] = [];

  for (const generator of config.generators) {
    if (generator === 'typescript') {
      files.push(...runTypescriptGenerator(ir, config));
    }
  }

  // Step 3: Format with Biome (if enabled)
  const shouldFormat = config.format !== false;
  if (shouldFormat) {
    files = await formatWithBiome(files);
  }

  // Step 4: Write files to disk
  await mkdir(config.outputDir, { recursive: true });

  for (const file of files) {
    const filePath = join(config.outputDir, file.path);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
  }

  return { files, ir };
}
