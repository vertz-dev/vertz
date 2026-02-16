/** Severity of a compiler diagnostic. */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';
/** A diagnostic message emitted during compilation. */
export interface CompilerDiagnostic {
  /** Unique code identifying this diagnostic kind. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Severity level. */
  severity: DiagnosticSeverity;
  /** 1-based line number in source. */
  line: number;
  /** 0-based column offset. */
  column: number;
  /** Optional fix suggestion. */
  fix?: string;
}
/** Result of a compile() call. */
export interface CompileOutput {
  /** Transformed source code. */
  code: string;
  /** Source map (v3 JSON). */
  map: {
    version: number;
    sources: string[];
    sourcesContent?: string[];
    mappings: string;
    names: string[];
  };
  /** Diagnostics produced during compilation. */
  diagnostics: CompilerDiagnostic[];
}
/** Classification of a variable's reactivity. */
export type ReactivityKind = 'signal' | 'computed' | 'static';
/** Information about a variable inside a component. */
export interface VariableInfo {
  /** Variable name. */
  name: string;
  /** Reactivity classification. */
  kind: ReactivityKind;
  /** 0-based start position of the declaration in source. */
  start: number;
  /** 0-based end position of the declaration in source. */
  end: number;
  /**
   * Signal properties on this variable (for signal-returning APIs like query()).
   *
   * @remarks
   * Uses `Set<string>` for O(1) lookup performance during transformation.
   * **Not JSON-serializable** — if this type is serialized (e.g., for caching or IPC),
   * convert to `Array.from(signalProperties)` before serialization and reconstruct
   * the Set on deserialization.
   */
  signalProperties?: Set<string>;
}
/** Information about a detected component function. */
export interface ComponentInfo {
  /** Component function name. */
  name: string;
  /** Name of the props parameter (e.g. "props"), or null if none. */
  propsParam: string | null;
  /** Whether the props parameter uses destructuring. */
  hasDestructuredProps: boolean;
  /** 0-based start position of the function body. */
  bodyStart: number;
  /** 0-based end position of the function body. */
  bodyEnd: number;
}
/** Classification of a JSX expression's reactivity. */
export interface JsxExpressionInfo {
  /** 0-based start of the expression in source. */
  start: number;
  /** 0-based end of the expression in source. */
  end: number;
  /** Whether this expression depends on reactive variables. */
  reactive: boolean;
  /** Names of reactive variables referenced. */
  deps: string[];
}
/** Kinds of in-place mutations on signal variables. */
export type MutationKind =
  | 'method-call'
  | 'property-assignment'
  | 'index-assignment'
  | 'delete'
  | 'object-assign';
/** A detected in-place mutation on a signal variable. */
export interface MutationInfo {
  /** The signal variable name being mutated. */
  variableName: string;
  /** Kind of mutation. */
  kind: MutationKind;
  /** 0-based start of the mutation expression. */
  start: number;
  /** 0-based end of the mutation expression. */
  end: number;
}
//# sourceMappingURL=types.d.ts.map
