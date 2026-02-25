/**
 * Bun plugin with CSS sidecar files for HMR support.
 *
 * Instead of virtual CSS modules (Vite approach), this plugin:
 * 1. Writes extracted CSS to real .css files on disk (.vertz/css/)
 * 2. Injects `import '.vertz/css/<hash>.css'` into the compiled JS output
 * 3. Injects `import.meta.hot.accept()` so components self-accept HMR updates
 *
 * Bun's built-in CSS HMR handles <link> tag swapping for the sidecar files,
 * giving us CSS-only hot updates without full page refresh.
 *
 * Usage:
 *   import { vertzBunPluginHMR } from './vertz-bun-plugin-hmr';
 *   // In bunfig.toml [serve.static] plugins or Bun.build({ plugins: [...] })
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import remapping from '@ampproject/remapping';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';

// Use relative source imports since explorations/ is outside the workspace
import { ComponentAnalyzer } from '../../packages/ui-compiler/src/analyzers/component-analyzer';
import { compile } from '../../packages/ui-compiler/src/compiler';
import type { CSSExtractionResult } from '../../packages/ui-compiler/src/css-extraction/extractor';
import { CSSExtractor } from '../../packages/ui-compiler/src/css-extraction/extractor';
import { HydrationTransformer } from '../../packages/ui-compiler/src/transformers/hydration-transformer';

export interface VertzBunPluginHMROptions {
  /** Regex filter for files to transform. Defaults to .tsx files. */
  filter?: RegExp;
  /** Compilation target. 'dom' (default) or 'tui'. */
  target?: 'dom' | 'tui';
  /**
   * Directory for CSS sidecar files.
   * Defaults to `.vertz/css` relative to the project root.
   */
  cssOutDir?: string;
  /** Enable HMR support (import.meta.hot.accept). Defaults to true. */
  hmr?: boolean;
  /**
   * Enable JS Fast Refresh (component-level HMR).
   * When true, components are wrapped with tracking code and re-mounted
   * on file change instead of doing a full page reload.
   * Defaults to true when hmr is true.
   */
  jsHmr?: boolean;
  /** Project root for computing relative paths. */
  projectRoot?: string;
}

/** CSS extractions tracked across all transformed files (for production build). */
export const fileExtractions = new Map<string, CSSExtractionResult>();

/** Map of source file → CSS sidecar file path (for debugging). */
export const cssSidecarMap = new Map<string, string>();

/**
 * Generate a stable hash from a file path for CSS sidecar naming.
 * Uses djb2 to match the CSS extractor's class name hashing.
 */
function filePathHash(filePath: string): string {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) + hash + filePath.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Create a Bun plugin with CSS sidecar file support for HMR.
 */
export function vertzBunPluginHMR(options?: VertzBunPluginHMROptions): BunPlugin {
  const filter = options?.filter ?? /\.tsx$/;
  const hmr = options?.hmr ?? true;
  const jsHmr = options?.jsHmr ?? hmr;
  const projectRoot = options?.projectRoot ?? resolve(import.meta.dir, '..', '..');
  const cssOutDir = options?.cssOutDir ?? resolve(projectRoot, '.vertz', 'css');
  const cssExtractor = new CSSExtractor();
  const componentAnalyzer = new ComponentAnalyzer();

  // Ensure CSS output directory exists
  mkdirSync(cssOutDir, { recursive: true });

  return {
    name: 'vertz-compiler-hmr',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await Bun.file(args.path).text();

        // ── 1. Hydration transform ─────────────────────────────
        const hydrationS = new MagicString(source);
        const hydrationProject = new Project({
          useInMemoryFileSystem: true,
          compilerOptions: {
            jsx: ts.JsxEmit.Preserve,
            strict: true,
          },
        });
        const hydrationSourceFile = hydrationProject.createSourceFile(args.path, source);
        const hydrationTransformer = new HydrationTransformer();
        hydrationTransformer.transform(hydrationS, hydrationSourceFile);

        // ── 1b. Context stable IDs: inject __stableId for HMR ────
        //
        // Detect `const X = createContext(...)` patterns and inject a stable
        // ID so the context registry survives bundle re-evaluation.
        // The ID format is `filePath::varName` — unique because file paths
        // are unique and variable names are unique within a file.
        // This runs before compile() so the IDs flow through to the output.
        if (jsHmr) {
          const relFilePath = relative(projectRoot, args.path);
          for (const stmt of hydrationSourceFile.getStatements()) {
            if (!ts.isVariableStatement(stmt.compilerNode)) continue;
            for (const decl of stmt.compilerNode.declarationList.declarations) {
              if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
              const callText = decl.initializer.expression.getText(hydrationSourceFile.compilerNode);
              if (callText !== 'createContext') continue;
              if (!ts.isIdentifier(decl.name)) continue;

              const varName = decl.name.text;
              const stableId = `${relFilePath}::${varName}`;
              const callExpr = decl.initializer;

              // Insert the stable ID as the last argument
              const argsArr = callExpr.arguments;
              if (argsArr.length === 0) {
                // createContext<T>() → createContext<T>(undefined, 'id')
                const closeParenPos = callExpr.end - 1;
                hydrationS.appendLeft(closeParenPos, `undefined, '${stableId}'`);
              } else {
                // createContext<T>(defaultValue) → createContext<T>(defaultValue, 'id')
                const lastArg = argsArr[argsArr.length - 1];
                hydrationS.appendLeft(lastArg.end, `, '${stableId}'`);
              }
            }
          }
        }

        const hydratedCode = hydrationS.toString();
        const hydrationMap = hydrationS.generateMap({
          source: args.path,
          includeContent: true,
        });

        // ── 2. Compile (reactive + JSX transforms) ─────────────
        const compileResult = compile(hydratedCode, {
          filename: args.path,
          target: options?.target,
        });

        // ── 3. Source map chaining ──────────────────────────────
        const remapped = remapping(
          [
            compileResult.map as import('@ampproject/remapping').EncodedSourceMap,
            hydrationMap as import('@ampproject/remapping').EncodedSourceMap,
          ],
          () => null,
        );

        // ── 4. CSS extraction → sidecar file ───────────────────
        const extraction = cssExtractor.extract(source, args.path);
        let cssImportLine = '';

        if (extraction.css.length > 0) {
          fileExtractions.set(args.path, extraction);

          // Write CSS to a sidecar file on disk
          const hash = filePathHash(args.path);
          const cssFileName = `${hash}.css`;
          const cssFilePath = resolve(cssOutDir, cssFileName);

          writeFileSync(cssFilePath, extraction.css);
          cssSidecarMap.set(args.path, cssFilePath);

          // Compute relative import path from the source file to the CSS file
          const relPath = relative(dirname(args.path), cssFilePath);
          const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;
          cssImportLine = `import '${importPath}';\n`;
        }

        // ── 5. Fast Refresh: detect components and inject wrappers ──
        let refreshPreamble = '';
        let refreshEpilogue = '';
        const componentNames: string[] = [];

        if (jsHmr) {
          // Analyze the source for component functions (functions that return JSX).
          // We reuse the hydration source file since it's already parsed by ts-morph.
          const components = componentAnalyzer.analyze(hydrationSourceFile);
          if (components.length > 0) {
            // Access Fast Refresh functions from globalThis instead of imports.
            // CRITICAL: Component modules must NOT import @vertz/ui/internals or
            // the runtime module directly. Bun's HMR propagates updates through
            // the import graph — new imports to @vertz/ui/dist chunks would cause
            // those chunks to appear in the HMR update, and since they don't
            // self-accept, Bun triggers a full page reload. By reading from
            // globalThis (populated by vertz-fast-refresh-runtime.ts loaded in
            // the HTML), we avoid polluting the import graph entirely.
            refreshPreamble +=
              `const __$fr = globalThis[Symbol.for('vertz:fast-refresh')];\n` +
              `const { __$refreshReg, __$refreshTrack, __$refreshPerform, ` +
              `pushScope: __$pushScope, popScope: __$popScope, ` +
              `_tryOnCleanup: __$tryCleanup, runCleanups: __$runCleanups, ` +
              `getContextScope: __$getCtx, setContextScope: __$setCtx } = __$fr;\n` +
              `const __$moduleId = '${args.path}';\n`;

            // For each component, generate wrapper + registration code
            for (const comp of components) {
              componentNames.push(comp.name);
              refreshEpilogue +=
                `\nconst __$orig_${comp.name} = ${comp.name};\n` +
                `${comp.name} = function(...__$args) {\n` +
                `  const __$scope = __$pushScope();\n` +
                `  const __$ctx = __$getCtx();\n` +
                `  const __$ret = __$orig_${comp.name}.apply(this, __$args);\n` +
                `  __$popScope();\n` +
                `  if (__$scope.length > 0) {\n` +
                `    __$tryCleanup(() => __$runCleanups(__$scope));\n` +
                `  }\n` +
                `  return __$refreshTrack(__$moduleId, '${comp.name}', __$ret, __$args, __$scope, __$ctx);\n` +
                `};\n` +
                `__$refreshReg(__$moduleId, '${comp.name}', ${comp.name});\n`;
            }
          }
        }

        // ── 6. Assemble output ─────────────────────────────────
        const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
        const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

        // Prepend CSS import + refresh preamble, append wrappers + HMR accept
        let contents = '';
        if (cssImportLine) {
          contents += cssImportLine;
        }
        if (refreshPreamble) {
          contents += refreshPreamble;
        }
        contents += compileResult.code;

        if (refreshEpilogue) {
          contents += refreshEpilogue;
        }

        if (hmr) {
          // Bun statically analyzes import.meta.hot.accept() calls.
          // It MUST be called directly (no optional chaining, no variable indirection).
          // Each module that self-accepts will be individually re-evaluated on change.
          contents += '\nimport.meta.hot.accept();\n';
        }

        if (jsHmr && componentNames.length > 0) {
          // Perform hot replacement after module re-evaluation completes
          contents += `__$refreshPerform(__$moduleId);\n`;
        }

        contents += sourceMapComment;

        return { contents, loader: 'tsx' };
      });
    },
  };
}

export default vertzBunPluginHMR();
