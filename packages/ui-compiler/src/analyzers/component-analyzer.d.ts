import { type SourceFile } from 'ts-morph';
import type { ComponentInfo } from '../types';
/**
 * Detect functions that return JSX — the component boundaries
 * the compiler operates within.
 */
export declare class ComponentAnalyzer {
  analyze(sourceFile: SourceFile): ComponentInfo[];
  /**
   * Check whether a function contains JSX — either in a return statement
   * or anywhere in the function body (e.g., variable assignments, loops,
   * function call arguments).
   */
  private _returnsJsx;
  private _containsJsx;
  private _fromFunctionDeclaration;
  private _fromVariableDeclaration;
}
//# sourceMappingURL=component-analyzer.d.ts.map
