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
import type { LoadedReactivityManifest } from '@vertz/ui-compiler';
import {
  ComponentAnalyzer,
  CSSExtractor,
  compile,
  generateAllManifests,
  HydrationTransformer,
  regenerateFileManifest,
} from '@vertz/ui-compiler';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';

import { injectContextStableIds } from './context-stable-ids';
import { generateRefreshCode } from './fast-refresh-codegen';
import { filePathHash } from './file-path-hash';
import type {
  CSSSidecarMap,
  FileExtractionsMap,
  ManifestUpdateResult,
  VertzBunPluginOptions,
  VertzBunPluginResult,
} from './types';

/**
 * Compare two loaded manifests for export shape equality.
 * Returns true if both have the same exports with the same reactivity types.
 */
function manifestsEqual(
  a: LoadedReactivityManifest | undefined,
  b: LoadedReactivityManifest,
): boolean {
  if (!a) return false;

  const aKeys = Object.keys(a.exports);
  const bKeys = Object.keys(b.exports);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    const aExport = a.exports[key];
    const bExport = b.exports[key];

    if (!aExport || !bExport) return false;
    if (aExport.kind !== bExport.kind) return false;
    if (aExport.reactivity.type !== bExport.reactivity.type) return false;

    // For signal-api, compare property sets
    if (aExport.reactivity.type === 'signal-api' && bExport.reactivity.type === 'signal-api') {
      if (!setsEqual(aExport.reactivity.signalProperties, bExport.reactivity.signalProperties)) {
        return false;
      }
      if (!setsEqual(aExport.reactivity.plainProperties, bExport.reactivity.plainProperties)) {
        return false;
      }
    }
  }

  return true;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

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
  const logger = options?.logger;
  const diagnostics = options?.diagnostics;

  const fileExtractions: FileExtractionsMap = new Map();
  const cssSidecarMap: CSSSidecarMap = new Map();

  // ── 0. Manifest generation pre-pass (cross-file reactivity) ──────
  // Generate reactivity manifests for all source files at plugin construction
  // time. This enables the compiler to understand the reactivity shape of
  // imports from user files (custom hooks, barrel re-exports, etc.).
  const srcDir = options?.srcDir ?? resolve(projectRoot, 'src');
  // Load the raw JSON manifest to avoid Set→Array round-trip
  const frameworkManifestJson = require(
    require.resolve('@vertz/ui/reactivity.json'),
  ) as import('@vertz/ui-compiler').ReactivityManifest;
  const manifestResult = generateAllManifests({
    srcDir,
    packageManifests: { '@vertz/ui': frameworkManifestJson },
  });

  // Mutable manifest map — HMR updates can modify it
  const manifests: Map<string, LoadedReactivityManifest> = manifestResult.manifests;

  // Cached Record view of the manifest map — rebuilt only when dirty
  let manifestsRecord: Record<string, LoadedReactivityManifest> | null = null;
  const getManifestsRecord = (): Record<string, LoadedReactivityManifest> => {
    if (manifestsRecord) return manifestsRecord;
    const record: Record<string, LoadedReactivityManifest> = {};
    for (const [key, value] of manifests) {
      record[key] = value;
    }
    manifestsRecord = record;
    return record;
  };

  if (logger?.isEnabled('manifest')) {
    logger.log('manifest', 'pre-pass', {
      files: manifests.size,
      durationMs: Math.round(manifestResult.durationMs),
      warnings: manifestResult.warnings.length,
    });
    for (const [filePath, manifest] of manifests) {
      const exportShapes: Record<string, string> = {};
      for (const [name, info] of Object.entries(manifest.exports)) {
        exportShapes[name] = info.reactivity.type;
      }
      logger.log('manifest', 'file', {
        file: relative(projectRoot, filePath),
        exports: exportShapes,
      });
    }
    for (const warning of manifestResult.warnings) {
      logger.log('manifest', 'warning', { type: warning.type, message: warning.message });
    }
  }

  // Record manifest pre-pass in diagnostics
  diagnostics?.recordManifestPrepass(
    manifests.size,
    Math.round(manifestResult.durationMs),
    manifestResult.warnings.map((w) => ({ type: w.type, message: w.message })),
  );

  // Ensure CSS output directory exists
  mkdirSync(cssOutDir, { recursive: true });

  const plugin: BunPlugin = {
    name: 'vertz-bun-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        try {
          const startMs = logger?.isEnabled('plugin') ? performance.now() : 0;
          const source = await Bun.file(args.path).text();
          const relPath = relative(projectRoot, args.path);

          logger?.log('plugin', 'onLoad', { file: relPath, bytes: source.length });

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
            manifests: getManifestsRecord(),
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
            // Content hash prevents cascading re-mounts: when Bun re-evaluates all
            // modules in a single chunk, only the module whose content actually changed
            // gets marked dirty. Unchanged modules skip __$refreshPerform entirely.
            const contentHash = Bun.hash(source).toString(36);
            const refreshCode = generateRefreshCode(args.path, components, contentHash);
            if (refreshCode) {
              refreshPreamble = refreshCode.preamble;
              refreshEpilogue = refreshCode.epilogue;
            }
          }

          // ── 7. Assemble output ─────────────────────────────────

          // Count lines prepended before compileResult.code so we can
          // offset the source map. Without this, breakpoints land on
          // the wrong line in browser DevTools.
          let contents = '';
          if (cssImportLine) {
            contents += cssImportLine;
          }
          if (refreshPreamble) {
            contents += refreshPreamble;
          }

          const prependedLines = contents.split('\n').length - 1;

          // Offset source map: each ';' in mappings represents a new line.
          // Prepending N ';' chars adds N unmapped lines at the start,
          // aligning the rest of the map with compileResult.code's position.
          if (prependedLines > 0) {
            remapped.mappings = ';'.repeat(prependedLines) + remapped.mappings;
          }

          const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
          const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

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

          if (logger?.isEnabled('plugin')) {
            const durationMs = Math.round(performance.now() - startMs);
            const stages = [
              'hydration',
              fastRefresh ? 'stableIds' : null,
              'compile',
              'sourceMap',
              extraction.css.length > 0 ? 'css' : null,
              fastRefresh && refreshPreamble ? 'fastRefresh' : null,
              hmr ? 'hmr' : null,
            ]
              .filter(Boolean)
              .join(',');
            logger.log('plugin', 'done', { file: relPath, durationMs, stages });
          }
          diagnostics?.recordPluginProcess(relPath);

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

  // ── Manifest HMR update API ──────────────────────────────────────
  function updateManifest(filePath: string, sourceText: string): ManifestUpdateResult {
    const oldManifest = manifests.get(filePath);

    const { manifest: newManifest, warnings } = regenerateFileManifest(
      filePath,
      sourceText,
      manifests,
      { srcDir },
    );

    const changed = !manifestsEqual(oldManifest, newManifest);

    if (changed) {
      manifestsRecord = null; // Invalidate cached Record view
    }

    if (logger?.isEnabled('manifest')) {
      const exportShapes: Record<string, string> = {};
      for (const [name, info] of Object.entries(newManifest.exports)) {
        exportShapes[name] = info.reactivity.type;
      }
      logger.log('manifest', 'hmr-update', {
        file: relative(projectRoot, filePath),
        changed,
        exports: exportShapes,
      });
      for (const warning of warnings) {
        logger.log('manifest', 'warning', { type: warning.type, message: warning.message });
      }
    }

    return { changed };
  }

  function deleteManifest(filePath: string): boolean {
    const existed = manifests.delete(filePath);
    if (existed) {
      manifestsRecord = null; // Invalidate cached Record view

      if (logger?.isEnabled('manifest')) {
        logger.log('manifest', 'hmr-delete', {
          file: relative(projectRoot, filePath),
        });
      }
    }
    return existed;
  }

  return { plugin, fileExtractions, cssSidecarMap, updateManifest, deleteManifest };
}
