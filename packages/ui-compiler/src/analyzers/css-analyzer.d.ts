/**
 * CSS Analyzer — Extract css() calls from source and classify as static vs reactive.
 *
 * A css() call is "static" if all arguments are string literals, array literals
 * of string literals, and object literals with string literal values.
 * Any dynamic expression (variable references, function calls, template literals
 * with expressions) makes it "reactive" and prevents compile-time extraction.
 */
import { type SourceFile } from 'ts-morph';
/** Classification of a css() call. */
export type CSSCallKind = 'static' | 'reactive';
/** Information about a detected css() call. */
export interface CSSCallInfo {
  /** Whether the call can be fully resolved at compile time. */
  kind: CSSCallKind;
  /** 0-based start position of the entire css() call expression. */
  start: number;
  /** 0-based end position of the entire css() call expression. */
  end: number;
  /** 1-based line number. */
  line: number;
  /** 0-based column. */
  column: number;
  /** The raw source text of the css() call. */
  text: string;
  /** For static calls: the parsed block names. */
  blockNames: string[];
}
/**
 * Analyze a source file for css() calls.
 */
export declare class CSSAnalyzer {
  analyze(sourceFile: SourceFile): CSSCallInfo[];
  /** Classify whether a css() argument is fully static. */
  private classifyArgument;
  /** Check if a nested object (for complex selectors) is fully static. */
  private isStaticNestedObject;
  /** Extract block names from a static css() argument. */
  private extractBlockNames;
}
//# sourceMappingURL=css-analyzer.d.ts.map
