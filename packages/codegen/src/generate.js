import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { formatWithBiome } from './format';
import { emitManifestFile } from './generators/typescript/emit-cli';
import { emitClientFile, emitModuleFile } from './generators/typescript/emit-client';
import { emitRouteMapType } from './generators/typescript/emit-routes';
import {
  emitBarrelIndex,
  emitPackageJson,
  emitSchemaReExports,
} from './generators/typescript/emit-sdk';
import { emitModuleTypesFile, emitSharedTypesFile } from './generators/typescript/emit-types';
import { writeIncremental } from './incremental';
import { adaptIR } from './ir-adapter';

// ── TypeScript generator ───────────────────────────────────────────
function runTypescriptGenerator(ir, config) {
  const files = [];
  // Determine which schemas belong to which module
  const moduleSchemaNames = new Set();
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
    const moduleRefNames = new Set();
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
  // Route map type for typed test app
  files.push(emitRouteMapType(ir));
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
function runCLIGenerator(ir) {
  const files = [];
  // cli/manifest.ts — command definitions
  files.push(emitManifestFile(ir));
  return files;
}
// ── Synchronous core generate (used by pipeline) ────────────────
export function generateSync(ir, config) {
  const files = [];
  const generators = [];
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
export async function generate(appIR, config) {
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
  let incrementalResult;
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
//# sourceMappingURL=generate.js.map
