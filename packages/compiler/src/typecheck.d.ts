import type { ChildProcess } from 'node:child_process';
export interface TypecheckDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
}
export interface TypecheckResult {
  success: boolean;
  diagnostics: TypecheckDiagnostic[];
}
export interface TypecheckOptions {
  tsconfigPath?: string;
}
export declare function parseTscOutput(output: string): TypecheckDiagnostic[];
export declare function parseWatchBlock(block: string): TypecheckResult;
export interface TypecheckWatchOptions extends TypecheckOptions {
  spawner?: () => ChildProcess;
}
export declare function typecheckWatch(
  options?: TypecheckWatchOptions,
): AsyncGenerator<TypecheckResult>;
export declare function typecheck(options?: TypecheckOptions): Promise<TypecheckResult>;
//# sourceMappingURL=typecheck.d.ts.map
