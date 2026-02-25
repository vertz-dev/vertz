/**
 * Unified Bun plugin for Vertz UI compilation with optional HMR and Fast Refresh.
 *
 * Pipeline:
 * 1. Hydration transform (adds hydration IDs)
 * 2. Context stable IDs (if fastRefresh — injects __stableId for HMR)
 * 3. Compile (reactive signals + JSX transforms)
 * 4. Source map chaining (hydration → compile)
 * 5. CSS extraction → sidecar file (if CSS found)
 * 6. Fast Refresh wrappers (if fastRefresh — component tracking + registration)
 * 7. import.meta.hot.accept() (if hmr — self-accept HMR updates)
 * 8. Assemble final output with inline source map
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { EncodedSourceMap } from '@ampproject/remapping';
import remapping from '@ampproject/remapping';
import { ComponentAnalyzer, CSSExtractor, compile, HydrationTransformer } from '@vertz/ui-compiler';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';

import { injectContextStableIds } from './context-stable-ids';
import { generateRefreshCode } from './fast-refresh-codegen';
import { filePathHash } from './file-path-hash';
import type {
  CSSSidecarMap,
  FileExtractionsMap,
  VertzBunPluginOptions,
  VertzBunPluginResult,
} from './types';

/**
 * Create a Vertz Bun plugin with CSS sidecar support and optional Fast Refresh.
 *
 * Returns the plugin along with maps for CSS extractions and sidecar paths,
 * which build scripts need for dead CSS elimination.
 */
export function createVertzBunPlugin(options?: VertzBunPluginOptions): VertzBunPluginResult {
  const filter = options?.filter ?? /\.tsx$/;
  const hmr = options?.hmr ?? true;
  const fastRefresh = options?.fastRefresh ?? hmr;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const cssOutDir = options?.cssOutDir ?? resolve(projectRoot, '.vertz', 'css');
  const cssExtractor = new CSSExtractor();
  const componentAnalyzer = new ComponentAnalyzer();

  const fileExtractions: FileExtractionsMap = new Map();
  const cssSidecarMap: CSSSidecarMap = new Map();

  // Ensure CSS output directory exists
  mkdirSync(cssOutDir, { recursive: true });

  const plugin: BunPlugin = {
    name: 'vertz-bun-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        try {
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

          // ── 2. Context stable IDs (Fast Refresh only) ──────────
          if (fastRefresh) {
            const relFilePath = relative(projectRoot, args.path);
            injectContextStableIds(hydrationS, hydrationSourceFile, relFilePath);
          }

          const hydratedCode = hydrationS.toString();
          const hydrationMap = hydrationS.generateMap({
            source: args.path,
            includeContent: true,
          });

          // ── 3. Compile (reactive + JSX transforms) ─────────────
          const compileResult = compile(hydratedCode, {
            filename: args.path,
            target: options?.target,
          });

          // ── 4. Source map chaining ──────────────────────────────
          const remapped = remapping(
            [compileResult.map as EncodedSourceMap, hydrationMap as EncodedSourceMap],
            () => null,
          );

          // ── 5. CSS extraction → sidecar file ───────────────────
          const extraction = cssExtractor.extract(source, args.path);
          let cssImportLine = '';

          if (extraction.css.length > 0) {
            fileExtractions.set(args.path, extraction);

            if (hmr) {
              // Write CSS to a sidecar file on disk for Bun's CSS HMR
              const hash = filePathHash(args.path);
              const cssFileName = `${hash}.css`;
              const cssFilePath = resolve(cssOutDir, cssFileName);

              writeFileSync(cssFilePath, extraction.css);
              cssSidecarMap.set(args.path, cssFilePath);

              // Compute relative import path from source file to CSS file
              const relPath = relative(dirname(args.path), cssFilePath);
              const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;
              cssImportLine = `import '${importPath}';\n`;
            }
          }

          // ── 6. Fast Refresh: detect components and inject wrappers ──
          let refreshPreamble = '';
          let refreshEpilogue = '';

          if (fastRefresh) {
            const components = componentAnalyzer.analyze(hydrationSourceFile);
            const refreshCode = generateRefreshCode(args.path, components);
            if (refreshCode) {
              refreshPreamble = refreshCode.preamble;
              refreshEpilogue = refreshCode.epilogue;
            }
          }

          // ── 7. Assemble output ─────────────────────────────────
          const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
          const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

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
            contents += '\nimport.meta.hot.accept();\n';
          }

          contents += sourceMapComment;

          return { contents, loader: 'tsx' };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const relPath = relative(projectRoot, args.path);
          console.error(`[vertz-bun-plugin] Failed to process ${relPath}:`, message);
          throw err;
        }
      });
    },
  };

  return { plugin, fileExtractions, cssSidecarMap };
}
