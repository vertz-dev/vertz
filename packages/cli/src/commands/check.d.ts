import type { Compiler, Diagnostic } from '@vertz/compiler';
export interface CheckOptions {
  compiler: Compiler;
  format: 'text' | 'json' | 'github';
}
export interface CheckResult {
  success: boolean;
  diagnostics: Diagnostic[];
  output: string;
}
export declare function checkAction(options: CheckOptions): Promise<CheckResult>;
//# sourceMappingURL=check.d.ts.map
