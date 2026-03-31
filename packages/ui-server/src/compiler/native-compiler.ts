/**
 * Native compiler wrapper — loads the Rust-based Vertz compiler via NAPI
 * and exposes it with proper TypeScript types.
 *
 * This is the sole compilation path. The native compiler is required,
 * not optional. It replaces the ts-morph-based @vertz/ui-compiler.
 *
 * NAPI-RS auto-converts between Rust snake_case and JS camelCase
 * in both directions, so our TypeScript interfaces use camelCase
 * and the NAPI layer handles the conversion transparently.
 */

// ─── Public types ───────────────────────────────────────────────────

export interface NativeVariableInfo {
  name: string;
  kind: string;
  start: number;
  end: number;
  signalProperties?: string[];
  plainProperties?: string[];
  fieldSignalProperties?: string[];
  isReactiveSource?: boolean;
}

export interface NativeComponentInfo {
  name: string;
  bodyStart: number;
  bodyEnd: number;
  variables?: NativeVariableInfo[];
}

export interface NativeFieldSelection {
  queryVar: string;
  injectionPos: number;
  injectionKind: string;
  fields: string[];
  hasOpaqueAccess: boolean;
  nestedAccess: Array<{ field: string; nestedPath: string[] }>;
  inferredEntityName?: string;
}

export interface NativeExtractedRoute {
  pattern: string;
  componentName: string;
  routeType: string;
}

export interface NativeExtractedQuery {
  descriptorChain: string;
  entity?: string;
  operation?: string;
  idParam?: string;
}

export interface ManifestEntry {
  moduleSpecifier: string;
  exportName: string;
  reactivityType: string;
  signalProperties?: string[];
  plainProperties?: string[];
  fieldSignalProperties?: string[];
}

export interface NativeCompileOptions {
  filename?: string;
  fastRefresh?: boolean;
  target?: string;
  manifests?: ManifestEntry[];
  hydrationMarkers?: boolean;
  routeSplitting?: boolean;
  fieldSelection?: boolean;
  prefetchManifest?: boolean;
}

export interface NativeCompileResult {
  code: string;
  css?: string;
  map?: string;
  diagnostics: Array<{ message: string; line?: number; column?: number }>;
  components?: NativeComponentInfo[];
  hydrationIds?: string[];
  fieldSelections?: NativeFieldSelection[];
  extractedRoutes?: NativeExtractedRoute[];
  extractedQueries?: NativeExtractedQuery[];
  routeParams?: string[];
}

export interface AotCompileOptions {
  filename?: string;
}

export interface AotComponentInfo {
  name: string;
  tier: 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';
  holes: string[];
  queryKeys: string[];
  fallbackReason?: string;
}

export interface AotCompileResult {
  code: string;
  components: AotComponentInfo[];
  css?: string[];
}

export interface NativeCompiler {
  compile(source: string, options?: NativeCompileOptions): NativeCompileResult;
  compileForSsrAot(source: string, options?: AotCompileOptions): AotCompileResult;
}

// NAPI-RS auto-converts camelCase <-> snake_case in both directions,
// so we can pass our TypeScript types directly to the native compiler.

interface RawNativeCompiler {
  compile(source: string, options?: NativeCompileOptions): NativeCompileResult;
  compileForSsrAot(source: string, options?: AotCompileOptions): AotCompileResult;
}

// ─── Loader ─────────────────────────────────────────────────────────

let cachedCompiler: RawNativeCompiler | null = null;

function resolveBinaryName(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `vertz-compiler.${platform}-${arch}.node`;
}

/**
 * Load the native Rust compiler. Throws if the binary is not available.
 *
 * The native compiler is required — there is no ts-morph fallback.
 */
export function loadNativeCompiler(): NativeCompiler {
  if (cachedCompiler) {
    return wrapCompiler(cachedCompiler);
  }

  const binaryName = resolveBinaryName();

  try {
    const modulePath = require.resolve(`@vertz/native-compiler/${binaryName}`);
    cachedCompiler = require(modulePath) as RawNativeCompiler;
    return wrapCompiler(cachedCompiler);
  } catch {
    throw new Error(
      `Failed to load native compiler binary: @vertz/native-compiler/${binaryName}. ` +
        'Ensure @vertz/native-compiler is installed with the correct platform binary.',
    );
  }
}

function wrapCompiler(raw: RawNativeCompiler): NativeCompiler {
  return {
    compile(source, options) {
      const result = raw.compile(source, options);
      // Ensure diagnostics is always an array (NAPI may return undefined)
      return { ...result, diagnostics: result.diagnostics ?? [] };
    },
    compileForSsrAot(source, options) {
      return raw.compileForSsrAot(source, options);
    },
  };
}

// ─── Convenience functions ──────────────────────────────────────────

/**
 * Compile a TypeScript/JSX source file using the native Rust compiler.
 */
export function compile(source: string, options?: NativeCompileOptions): NativeCompileResult {
  return loadNativeCompiler().compile(source, options);
}

/**
 * Compile a source file for AOT SSR rendering.
 */
export function compileForSsrAot(source: string, options?: AotCompileOptions): AotCompileResult {
  return loadNativeCompiler().compileForSsrAot(source, options);
}
