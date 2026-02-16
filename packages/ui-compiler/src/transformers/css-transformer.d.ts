/**
 * CSS Transformer -- Replace static css() calls with class name references
 * and extract CSS into a separate output.
 *
 * For static css() calls:
 * 1. Parse all shorthand entries
 * 2. Resolve tokens to CSS values
 * 3. Generate deterministic class names
 * 4. Replace the css() call with a plain object mapping block names to class names
 * 5. Collect extracted CSS rules
 *
 * For reactive css() calls:
 * - Leave the call in place (runtime handles it)
 * - Emit a diagnostic info message
 */
import type MagicString from 'magic-string';
import type { SourceFile } from 'ts-morph';
import type { CSSCallInfo } from '../analyzers/css-analyzer';
/** Result of CSS transformation. */
export interface CSSTransformResult {
  /** Extracted CSS rules. */
  css: string;
  /** Class name mappings per css() call: call index -> { blockName -> className }. */
  classNameMaps: Map<number, Record<string, string>>;
}
/**
 * Transform static css() calls in the source.
 */
export declare class CSSTransformer {
  transform(
    s: MagicString,
    sourceFile: SourceFile,
    cssCalls: CSSCallInfo[],
    filePath: string,
  ): CSSTransformResult;
  /** Process a static css() call to extract CSS and generate class names. */
  private processStaticCall;
  /** Build the replacement JS expression: { card: '_a1b2c3d4', title: '_e5f6g7h8' } */
  private buildReplacement;
}
//# sourceMappingURL=css-transformer.d.ts.map
