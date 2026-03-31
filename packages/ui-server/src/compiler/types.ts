/** Options for the compile() function. */
export interface CompileOptions {
  /** Filename for source map generation. Defaults to 'input.tsx'. */
  filename?: string;
  /** Compilation target. 'dom' uses @vertz/ui/internals, 'tui' uses @vertz/tui/internals. */
  target?: 'dom' | 'tui';
  /** Pre-loaded reactivity manifests keyed by module specifier (e.g., '@vertz/ui'). */
  manifests?: Record<string, LoadedReactivityManifest>;
}

/** AOT compilation tier classification. */
export type AotTier = 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';

/** Per-component AOT compilation result. */
export interface AotComponentInfo {
  /** Component function name. */
  name: string;
  /** AOT tier classification. */
  tier: AotTier;
  /** Component names that need runtime rendering (holes). */
  holes: string[];
  /** Query cache keys this component reads via ctx.getData(). Empty for props-only components. */
  queryKeys: string[];
  /** Reason for runtime-fallback classification, if applicable. Aids developer diagnostics. */
  fallbackReason?: string;
}

/** Result of a compileForSSRAot() call. */
export interface AotCompileOutput {
  /** Transformed source code with AOT string-builder functions. */
  code: string;
  /** Source map (v3 JSON). */
  map: {
    version: number;
    sources: string[];
    sourcesContent?: string[];
    mappings: string;
    names: string[];
  };
  /** Per-component AOT info. */
  components: AotComponentInfo[];
  /** Diagnostics produced during compilation. */
  diagnostics: CompilerDiagnostic[];
  /** Extracted CSS rule blocks from static css() calls. Each entry is one CSS rule
   *  (e.g., `.class { ... }`) for fine-grained per-rule filtering in SSR (#1988, #1989). */
  css?: string[];
}

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
  /** Plain (non-signal) properties on this variable. */
  plainProperties?: Set<string>;
  /** Per-field signal properties (e.g., form().title.error). */
  fieldSignalProperties?: Set<string>;
  /** Synthetic variable name this binding was destructured from (e.g., `__query_0`). */
  destructuredFrom?: string;
  /** Whether this variable is a reactive source (e.g., useContext result). */
  isReactiveSource?: boolean;
}

/** Information about a single binding from a destructured props parameter. */
export interface PropsBindingInfo {
  /** Property name in the props object (e.g., 'id' in `{ id: cardId }`). */
  propName: string;
  /** Local binding name (e.g., 'cardId' in `{ id: cardId }`, or same as propName). */
  bindingName: string;
  /** Default value expression text, if any. */
  defaultValue?: string;
  /** Whether this is a rest element (`...rest`). */
  isRest: boolean;
}

/** Detailed info about a destructured props parameter, for the transform. */
export interface DestructuredPropsInfo {
  /** All bindings from the destructuring pattern. */
  bindings: PropsBindingInfo[];
  /** Whether the pattern includes a rest element. */
  hasRest: boolean;
  /** Whether the pattern includes nested destructuring. */
  hasNestedDestructuring: boolean;
  /** 0-based start position of the entire parameter (including type annotation). */
  paramStart: number;
  /** 0-based end position of the entire parameter (including type annotation). */
  paramEnd: number;
  /** The type annotation text (e.g., ': TodoItemProps'), or null if none. */
  typeAnnotation: string | null;
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
  /** Detailed destructuring info, populated when hasDestructuredProps is true. */
  destructuredProps?: DestructuredPropsInfo;
}

/** Info about a callback-local const to inline in __attr()/__child() getters. */
export interface CallbackConstInline {
  /** The const variable name (e.g., 'isActive'). */
  name: string;
  /** 0-based start of the initializer expression in source. */
  initStart: number;
  /** 0-based end of the initializer expression in source. */
  initEnd: number;
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
  /**
   * Callback-local consts to inline in __attr()/__child() getters.
   * When present, the JSX transformer replaces these const names with their
   * initializer text (from MagicString, which has .value transforms) so that
   * signal reads end up inside the getter — required for __list() render
   * functions where renderFn is called once per key and DOM elements are reused.
   */
  callbackConstInlines?: CallbackConstInline[];
}

// ─── Reactivity Manifest Types ──────────────────────────────────────

/** Schema for a per-file reactivity manifest. */
export interface ReactivityManifest {
  /** Schema version for forward compatibility. */
  version: 1;
  /** The source file path (resolved, absolute) or package name. */
  filePath: string;
  /** Exports and their reactivity shapes. */
  exports: Record<string, ExportReactivityInfo>;
}

/** Reactivity info for a single export. */
export interface ExportReactivityInfo {
  /** What kind of export this is. */
  kind: 'function' | 'variable' | 'component' | 'class';
  /** Reactivity shape of this export. */
  reactivity: ReactivityShape;
}

/** Reactivity shape of a value or function return. */
export type ReactivityShape =
  | { type: 'static' }
  | { type: 'signal' }
  | {
      type: 'signal-api';
      signalProperties: Set<string> | string[];
      plainProperties: Set<string> | string[];
      fieldSignalProperties?: Set<string> | string[];
    }
  | { type: 'reactive-source' }
  | { type: 'unknown' };

/** Loaded manifest with Sets (after JSON deserialization). */
export interface LoadedReactivityManifest {
  version: 1;
  filePath: string;
  exports: Record<string, LoadedExportReactivityInfo>;
}

/** Export info with signal-api properties converted to Sets. */
export interface LoadedExportReactivityInfo {
  kind: 'function' | 'variable' | 'component' | 'class';
  reactivity: LoadedReactivityShape;
}

/** Reactivity shape with all arrays converted to Sets. */
export type LoadedReactivityShape =
  | { type: 'static' }
  | { type: 'signal' }
  | {
      type: 'signal-api';
      signalProperties: Set<string>;
      plainProperties: Set<string>;
      fieldSignalProperties?: Set<string>;
    }
  | { type: 'reactive-source' }
  | { type: 'unknown' };

// ─── Mutation Types ─────────────────────────────────────────────────

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
