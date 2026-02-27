import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import type { ResolvedCodegenConfig } from './config';
import { formatWithBiome } from './format';
import { EntitySchemaGenerator } from './generators/entity-schema-generator';
import { EntitySdkGenerator } from './generators/entity-sdk-generator';
import { EntityTypesGenerator } from './generators/entity-types-generator';
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

function runTypescriptGenerator(ir: CodegenIR, _config: ResolvedCodegenConfig): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const generatorConfig = { outputDir: _config.outputDir, options: {} };

  // Entity types (types/tasks.ts, types/index.ts)
  const entityTypesGen = new EntityTypesGenerator();
  files.push(...entityTypesGen.generate(ir, generatorConfig));

  // Entity schema files (schemas/tasks.ts, schemas/index.ts)
  const entitySchemaGen = new EntitySchemaGenerator();
  files.push(...entitySchemaGen.generate(ir, generatorConfig));

  // Entity SDK files (entities/tasks.ts, entities/index.ts)
  const entitySdkGen = new EntitySdkGenerator();
  files.push(...entitySdkGen.generate(ir, generatorConfig));

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
