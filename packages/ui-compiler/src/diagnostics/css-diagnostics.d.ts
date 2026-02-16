/**
 * CSS Diagnostics -- Detect invalid tokens, magic numbers, and
 * other CSS-related issues in css() calls.
 *
 * Uses shared token tables from @vertz/ui/internals as the single source
 * of truth for valid properties, pseudos, spacing values, and color namespaces.
 */
import { type SourceFile } from 'ts-morph';
import type { CompilerDiagnostic } from '../types';
/**
 * Analyze css() calls for diagnostic issues.
 */
export declare class CSSDiagnostics {
  analyze(sourceFile: SourceFile): CompilerDiagnostic[];
  /** Validate a single shorthand string. */
  private validateShorthand;
  /** Validate a color token value. */
  private validateColorToken;
}
//# sourceMappingURL=css-diagnostics.d.ts.map
