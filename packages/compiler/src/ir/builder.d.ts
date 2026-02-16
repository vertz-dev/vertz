import type { Diagnostic } from '../errors';
import type { AppIR, DependencyGraphIR } from './types';
export declare function createEmptyDependencyGraph(): DependencyGraphIR;
export declare function createEmptyAppIR(): AppIR;
export declare function enrichSchemasWithModuleNames(ir: AppIR): AppIR;
export declare function addDiagnosticsToIR(ir: AppIR, diagnostics: readonly Diagnostic[]): AppIR;
//# sourceMappingURL=builder.d.ts.map
