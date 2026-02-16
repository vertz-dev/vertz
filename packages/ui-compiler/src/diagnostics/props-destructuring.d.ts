import type { SourceFile } from 'ts-morph';
import type { CompilerDiagnostic, ComponentInfo } from '../types';
/**
 * Warn when component props are destructured in the parameter.
 * Destructuring breaks reactivity because it eagerly reads values.
 */
export declare class PropsDestructuringDiagnostics {
  analyze(sourceFile: SourceFile, components: ComponentInfo[]): CompilerDiagnostic[];
}
//# sourceMappingURL=props-destructuring.d.ts.map
