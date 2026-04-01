/**
 * Native compiler wrapper — loads the Rust-based Vertz compiler via NAPI
 * and exposes it with proper TypeScript types.
 *
 * The native compiler is the primary compilation path. When the binary
 * is not available (e.g. CI without a pre-built binary), compile() falls
 * back to Bun's built-in JSX transpiler with a warning. compileForSsrAot()
 * has no fallback and throws if the binary is missing.
 *
 * NAPI-RS auto-converts between Rust snake_case and JS camelCase
 * in both directions, so our TypeScript interfaces use camelCase
 * and the NAPI layer handles the conversion transparently.
 */

// ─── Public types ───────────────────────────────────────────────────

import ts from 'typescript';

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
let nativeUnavailable = false;
let warnedFallback = false;

function resolveBinaryName(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `vertz-compiler.${platform}-${arch}.node`;
}

/**
 * Load the native Rust compiler. Throws if the binary is not available.
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

/**
 * Try to load the native compiler. Returns null if the binary is not available.
 */
export function tryLoadNativeCompiler(): NativeCompiler | null {
  if (cachedCompiler) return wrapCompiler(cachedCompiler);
  if (nativeUnavailable) return null;

  try {
    return loadNativeCompiler();
  } catch {
    nativeUnavailable = true;
    return null;
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

function wrapJsxChildrenInThunks(source: string, filename = 'fallback.js'): string {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const jsxFactoryNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      ['@vertz/ui/jsx-runtime', '@vertz/ui/jsx-dev-runtime'].includes(
        statement.moduleSpecifier.text,
      ) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (['jsx', 'jsxs', 'jsxDEV'].includes(importedName)) {
          jsxFactoryNames.add(element.name.text);
        }
      }
    }
  }

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        jsxFactoryNames.has(node.expression.text)
      ) {
        const [, props, ...rest] = node.arguments;

        if (props && ts.isObjectLiteralExpression(props)) {
          const transformedProps = ts.factory.updateObjectLiteralExpression(
            props,
            props.properties.map((property) => {
              if (
                ts.isPropertyAssignment(property) &&
                ts.isIdentifier(property.name) &&
                property.name.text === 'children'
              ) {
                if (
                  ts.isArrowFunction(property.initializer) ||
                  ts.isFunctionExpression(property.initializer)
                ) {
                  return property;
                }

                return ts.factory.updatePropertyAssignment(
                  property,
                  property.name,
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    property.initializer,
                  ),
                );
              }

              if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'children') {
                return ts.factory.createPropertyAssignment(
                  property.name,
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    property.name,
                  ),
                );
              }

              return property;
            }),
          );

          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
            node.arguments[0]!,
            transformedProps,
            ...rest,
          ]);
        }
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformed = result.transformed[0] ?? sourceFile;
  const printer = ts.createPrinter();
  const output = printer.printFile(transformed);
  result.dispose();
  return output;
}

/**
 * Fall back to Bun's built-in JSX transpiler.
 *
 * This produces basic JSX output without signal transforms, reactivity,
 * CSS extraction, or hydration markers. Used only when the native compiler
 * binary is unavailable (e.g. CI without pre-built platform binaries).
 */
function compileFallback(source: string): NativeCompileResult {
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      '[vertz] Native compiler binary not available — falling back to Bun JSX transpiler. ' +
        'Signal transforms, CSS extraction, and hydration markers will be missing.',
    );
  }

  const transpiled = new Bun.Transpiler({
    loader: 'tsx',
    autoImportJSX: true,
    tsconfig: JSON.stringify({
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@vertz/ui' },
    }),
  }).transformSync(source);

  return {
    code: wrapJsxChildrenInThunks(transpiled, 'fallback.js'),
    diagnostics: [],
  };
}

// ─── Convenience functions ──────────────────────────────────────────

/**
 * Compile a TypeScript/JSX source file using the native Rust compiler.
 * Falls back to Bun's JSX transpiler if the native binary is unavailable.
 */
export function compile(source: string, options?: NativeCompileOptions): NativeCompileResult {
  const compiler = tryLoadNativeCompiler();
  if (compiler) return compiler.compile(source, options);
  return compileFallback(source);
}

/**
 * Compile a source file for AOT SSR rendering.
 * This requires the native compiler — there is no fallback.
 */
export function compileForSsrAot(source: string, options?: AotCompileOptions): AotCompileResult {
  return loadNativeCompiler().compileForSsrAot(source, options);
}
