import { basename, dirname } from 'node:path';
import { hasErrors } from './errors';
import { createEmptyAppIR } from './ir/builder';
import { mergeIR } from './ir/merge';

function categorize(path, options) {
  const file = basename(path);
  if (file.endsWith('.schema.ts')) return 'schema';
  if (file.endsWith('.router.ts')) return 'router';
  if (file.endsWith('.service.ts')) return 'service';
  if (file.endsWith('.module.ts')) return 'module';
  if (path.includes('middleware/')) return 'middleware';
  if (options.entryFile && path === options.entryFile) return 'app-entry';
  if (file.startsWith('.env')) return 'env';
  if (file === 'vertz.config.ts') return 'config';
  return null;
}
export function categorizeChanges(changes, options = {}) {
  const result = {
    schema: [],
    router: [],
    service: [],
    module: [],
    middleware: [],
    requiresFullRecompile: false,
    requiresReboot: false,
  };
  for (const change of changes) {
    const category = categorize(change.path, options);
    switch (category) {
      case 'schema':
        result.schema.push(change);
        break;
      case 'router':
        result.router.push(change);
        break;
      case 'service':
        result.service.push(change);
        break;
      case 'module':
        result.module.push(change);
        break;
      case 'middleware':
        result.middleware.push(change);
        break;
      case 'app-entry':
        result.requiresFullRecompile = true;
        break;
      case 'env':
        result.requiresReboot = true;
        result.rebootReason = 'env';
        break;
      case 'config':
        result.requiresReboot = true;
        result.rebootReason = 'config';
        break;
    }
  }
  return result;
}
export function findAffectedModules(categorized, ir) {
  const affected = new Set();
  // Module file changes → match sourceFile to module
  for (const change of categorized.module) {
    const mod = ir.modules.find((m) => m.sourceFile === change.path);
    if (mod) affected.add(mod.name);
  }
  // Service file changes → find owning module via service sourceFile
  for (const change of categorized.service) {
    for (const mod of ir.modules) {
      if (mod.services.some((s) => s.sourceFile === change.path)) {
        affected.add(mod.name);
      }
    }
  }
  // Router file changes → find owning module via router sourceFile
  for (const change of categorized.router) {
    for (const mod of ir.modules) {
      if (mod.routers.some((r) => r.sourceFile === change.path)) {
        affected.add(mod.name);
      }
    }
  }
  // Schema file changes → find module whose directory contains the schema
  for (const change of categorized.schema) {
    for (const mod of ir.modules) {
      const moduleDir = dirname(mod.sourceFile);
      if (change.path.startsWith(moduleDir)) {
        affected.add(mod.name);
      }
    }
  }
  return [...affected];
}
export class IncrementalCompiler {
  currentIR;
  compiler;
  constructor(compiler) {
    this.compiler = compiler;
    this.currentIR = createEmptyAppIR();
  }
  async initialCompile() {
    const result = await this.compiler.compile();
    this.currentIR = result.ir;
    return result;
  }
  async handleChanges(changes) {
    const categorized = categorizeChanges(changes, {
      entryFile: this.compiler.getConfig().compiler.entryFile,
    });
    if (categorized.requiresReboot) {
      return { kind: 'reboot', reason: categorized.rebootReason ?? 'unknown' };
    }
    if (categorized.requiresFullRecompile) {
      const result = await this.compiler.compile();
      this.currentIR = result.ir;
      return { kind: 'full-recompile' };
    }
    // For incremental changes, re-analyze and merge
    const partialIR = await this.compiler.analyze();
    this.currentIR = mergeIR(this.currentIR, partialIR);
    const diagnostics = await this.compiler.validate(this.currentIR);
    if (!hasErrors(diagnostics)) {
      await this.compiler.generate(this.currentIR);
    }
    const affectedModules = findAffectedModules(categorized, this.currentIR);
    return {
      kind: 'incremental',
      affectedModules,
      diagnostics,
    };
  }
  getCurrentIR() {
    return this.currentIR;
  }
}
//# sourceMappingURL=incremental.js.map
