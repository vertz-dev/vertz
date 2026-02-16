import type { CompileResult, Compiler } from './compiler';
import type { Diagnostic } from './errors';
import type { AppIR } from './ir/types';
export interface FileChange {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
}
export type FileCategory =
  | 'schema'
  | 'router'
  | 'service'
  | 'module'
  | 'middleware'
  | 'app-entry'
  | 'env'
  | 'config';
export interface CategorizedChanges {
  schema: FileChange[];
  router: FileChange[];
  service: FileChange[];
  module: FileChange[];
  middleware: FileChange[];
  requiresFullRecompile: boolean;
  requiresReboot: boolean;
  rebootReason?: string;
}
export interface CategorizeOptions {
  entryFile?: string;
}
export declare function categorizeChanges(
  changes: FileChange[],
  options?: CategorizeOptions,
): CategorizedChanges;
export declare function findAffectedModules(categorized: CategorizedChanges, ir: AppIR): string[];
export type IncrementalResult =
  | {
      kind: 'incremental';
      affectedModules: string[];
      diagnostics: Diagnostic[];
    }
  | {
      kind: 'full-recompile';
    }
  | {
      kind: 'reboot';
      reason: string;
    };
export declare class IncrementalCompiler {
  private currentIR;
  private readonly compiler;
  constructor(compiler: Compiler);
  initialCompile(): Promise<CompileResult>;
  handleChanges(changes: FileChange[]): Promise<IncrementalResult>;
  getCurrentIR(): AppIR;
}
//# sourceMappingURL=incremental.d.ts.map
