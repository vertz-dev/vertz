import type { ResolvedCodegenConfig } from './config';
import { emitManifestFile } from './generators/typescript/emit-cli';
import { emitClientFile, emitModuleFile } from './generators/typescript/emit-client';
import { emitBarrelIndex, emitSchemaReExports } from './generators/typescript/emit-sdk';
import { emitModuleTypesFile, emitSharedTypesFile } from './generators/typescript/emit-types';
import type { CodegenIR, GeneratedFile } from './types';

// ── Result ──────────────────────────────────────────────────────

export interface GenerateResult {
  files: GeneratedFile[];
  fileCount: number;
  generators: string[];
}

// ── generate() orchestrator ─────────────────────────────────────

export function generate(ir: CodegenIR, config: ResolvedCodegenConfig): GenerateResult {
  const files: GeneratedFile[] = [];
  const generators: string[] = [];

  for (const gen of config.generators) {
    if (gen === 'typescript') {
      generators.push('typescript');
      files.push(...generateTypeScript(ir));
    } else if (gen === 'cli') {
      generators.push('cli');
      files.push(...generateCLI(ir));
    }
  }

  return {
    files,
    fileCount: files.length,
    generators,
  };
}

// ── TypeScript SDK Generator ────────────────────────────────────

function generateTypeScript(ir: CodegenIR): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // client.ts — SDK entry point
  files.push(emitClientFile(ir));

  // modules/{name}.ts — per-module method files
  for (const mod of ir.modules) {
    files.push(emitModuleFile(mod));
  }

  // types/{name}.ts — per-module type files
  for (const mod of ir.modules) {
    // For now, pass module-specific schemas as empty; shared schemas go to shared.ts
    files.push(emitModuleTypesFile(mod, []));
  }

  // types/shared.ts — shared schemas (only when schemas exist)
  if (ir.schemas.length > 0) {
    files.push(emitSharedTypesFile(ir.schemas));
  }

  // schemas.ts — schema validator re-exports (only when schemas exist)
  if (ir.schemas.length > 0) {
    files.push(emitSchemaReExports(ir.schemas));
  }

  // index.ts — barrel export
  files.push(emitBarrelIndex(ir));

  return files;
}

// ── CLI Generator ───────────────────────────────────────────────

function generateCLI(ir: CodegenIR): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // cli/manifest.ts — command definitions
  files.push(emitManifestFile(ir));

  return files;
}
