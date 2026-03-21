/**
 * Unified Bun plugin for Vertz UI compilation with optional HMR and Fast Refresh.
 *
 * Pipeline:
 * 1. Hydration transform (adds hydration IDs)
 * 2. Context stable IDs (if fastRefresh — injects __stableId for HMR)
 * 2.1. Island ID injection (auto-generates id prop for <Island> elements)
 * 2.5. Field selection injection (analyzes field access, injects select into queries)
 * 2.7. Image transform (detects <Image>, processes images, replaces with <picture>)
 * 3. Compile (reactive signals + JSX transforms)
 * 4. Source map chaining — remapping([compile, image, hydration]) (output→source order)
 * 5. CSS extraction → sidecar file (if CSS found)
 * 6. Fast Refresh wrappers (if fastRefresh — component tracking + registration)
 * 7. import.meta.hot.accept() (if hmr — self-accept HMR updates)
 * 8. Assemble final output with inline source map
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  resolveModuleSpecifier,
  transformRouteSplitting,
} from '@vertz/ui-compiler';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { injectContextStableIds } from './context-stable-ids';
import { loadEntitySchema } from './entity-schema-loader';
import { generateRefreshCode } from './fast-refresh-codegen';
import type { EntitySchemaManifest } from './field-selection-inject';
import { injectFieldSelection } from './field-selection-inject';
import { FieldSelectionManifest } from './field-selection-manifest';
import { filePathHash } from './file-path-hash';
import { computeImageOutputPaths, resolveImageSrc } from './image-paths';
import { processImage } from './image-processor';
import { transformImages } from './image-transform';
import { injectIslandIds } from './island-id-inject';
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
  const routeSplitting = options?.routeSplitting ?? false;
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
    packageManifests: { '@vertz/ui': frameworkManifestJson, 'vertz/ui': frameworkManifestJson },
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

  // ── 0.5. Field selection manifest pre-pass (cross-component fields) ──
  const fieldSelectionManifest = new FieldSelectionManifest();
  const fieldSelectionResolveImport = (specifier: string, fromFile: string): string | undefined => {
    return resolveModuleSpecifier(specifier, fromFile, {}, srcDir);
  };
  fieldSelectionManifest.setImportResolver(fieldSelectionResolveImport);

  // Scan all .tsx and .ts files for component prop field access and re-exports.
  // .tsx files contain component definitions; .ts files may be barrel re-exports.
  let fieldSelectionFileCount = 0;
  for (const [filePath] of manifests) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      try {
        const sourceText = readFileSync(filePath, 'utf-8');
        fieldSelectionManifest.registerFile(filePath, sourceText);
        fieldSelectionFileCount++;
      } catch {
        // Skip unreadable files
      }
    }
  }
  diagnostics?.recordFieldSelectionManifest(fieldSelectionFileCount);

  // ── 0.6. Entity schema manifest (relation-aware field selection) ──
  const entitySchemaPath =
    options?.entitySchemaPath ?? resolve(projectRoot, '.vertz', 'generated', 'entity-schema.json');
  let entitySchema: EntitySchemaManifest | undefined = loadEntitySchema(entitySchemaPath);

  if (logger?.isEnabled('fields') && entitySchema) {
    logger.log('fields', 'entity-schema-loaded', {
      path: entitySchemaPath,
      entities: Object.keys(entitySchema).length,
    });
  }

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

          // ── 0. Route splitting (production only) ────────────────
          let sourceAfterRouteSplit = source;
          let routeSplitMap: EncodedSourceMap | null = null;
          if (routeSplitting) {
            const splitResult = transformRouteSplitting(source, args.path);
            if (splitResult.transformed) {
              sourceAfterRouteSplit = splitResult.code;
              routeSplitMap = splitResult.map as unknown as EncodedSourceMap;
              if (logger?.isEnabled('plugin')) {
                for (const d of splitResult.diagnostics) {
                  logger.log('plugin', 'route-split', {
                    file: relPath,
                    route: d.routePath,
                    import: d.importSource,
                    symbol: d.symbolName,
                  });
                }
                for (const s of splitResult.skipped) {
                  logger.log('plugin', 'route-split-skip', {
                    file: relPath,
                    route: s.routePath,
                    reason: s.reason,
                  });
                }
              }
            }
          }

          // ── 1. Hydration transform ─────────────────────────────
          const hydrationS = new MagicString(sourceAfterRouteSplit);
          const hydrationProject = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
              jsx: ts.JsxEmit.Preserve,
              strict: true,
            },
          });
          const hydrationSourceFile = hydrationProject.createSourceFile(
            args.path,
            sourceAfterRouteSplit,
          );
          const hydrationTransformer = new HydrationTransformer();
          hydrationTransformer.transform(hydrationS, hydrationSourceFile);

          // ── 2. Context stable IDs (Fast Refresh only) ──────────
          if (fastRefresh) {
            const relFilePath = relative(projectRoot, args.path);
            injectContextStableIds(hydrationS, hydrationSourceFile, relFilePath);
          }

          // ── 2.1. Island ID injection ────────────────────────────
          {
            const relFilePath = relative(projectRoot, args.path);
            injectIslandIds(hydrationS, hydrationSourceFile, relFilePath);
          }

          const hydratedCode = hydrationS.toString();
          const hydrationMap = hydrationS.generateMap({
            source: args.path,
            includeContent: true,
          });

          // ── 2.5. Field selection injection ───────────────────
          // Analyze field access and inject select into query descriptors
          // Uses cross-file manifest to merge child component fields
          const fieldSelectionResult = injectFieldSelection(args.path, hydratedCode, {
            manifest: fieldSelectionManifest,
            resolveImport: fieldSelectionResolveImport,
            entitySchema,
          });
          const codeForCompile = fieldSelectionResult.code;

          // Log field selection results
          if (logger?.isEnabled('fields') && fieldSelectionResult.diagnostics.length > 0) {
            for (const diag of fieldSelectionResult.diagnostics) {
              logger.log('fields', 'query', {
                file: relPath,
                queryVar: diag.queryVar,
                fields: diag.combinedFields,
                opaque: diag.hasOpaqueAccess,
                injected: diag.injected,
                crossFile: diag.crossFileFields.length,
              });
            }
          }

          // Record in diagnostics
          if (diagnostics && fieldSelectionResult.diagnostics.length > 0) {
            diagnostics.recordFieldSelection(relPath, {
              queries: fieldSelectionResult.diagnostics.map((d) => ({
                queryVar: d.queryVar,
                fields: d.combinedFields,
                hasOpaqueAccess: d.hasOpaqueAccess,
                crossFileFields: d.crossFileFields,
                injected: d.injected,
              })),
            });
          }

          // ── 2.7. Image transform ────────────────────────────────
          const imageOutputDir = resolve(projectRoot, '.vertz', 'images');
          const imageQueue: Array<{
            sourcePath: string;
            width: number;
            height: number;
            quality: number;
            fit: string;
            outputDir: string;
          }> = [];

          const imageResult = transformImages(codeForCompile, args.path, {
            projectRoot,
            resolveImagePath: (src) => resolveImageSrc(src, args.path, projectRoot),
            getImageOutputPaths: (sourcePath, w, h, q, f) => {
              const paths = computeImageOutputPaths(sourcePath, w, h, q, f);
              if (!paths) {
                return {
                  webp1x: sourcePath,
                  webp2x: sourcePath,
                  fallback: sourcePath,
                  fallbackType: 'image/jpeg',
                };
              }

              imageQueue.push({
                sourcePath,
                width: w,
                height: h,
                quality: q,
                fit: f,
                outputDir: imageOutputDir,
              });

              return paths;
            },
          });

          const codeAfterImageTransform = imageResult.code;

          // Process queued images in parallel
          if (imageQueue.length > 0) {
            await Promise.all(
              imageQueue.map((opts) =>
                processImage({ ...opts, fit: opts.fit as 'cover' | 'contain' | 'fill' }),
              ),
            );
          }

          // ── 3. Compile (reactive + JSX transforms) ─────────────
          const compileResult = compile(codeAfterImageTransform, {
            filename: args.path,
            target: options?.target,
            manifests: getManifestsRecord(),
          });

          // ── 4. Source map chaining ──────────────────────────────
          // Chain maps in output→source order: compile → image → hydration
          const mapsToChain: EncodedSourceMap[] = [compileResult.map as EncodedSourceMap];
          if (imageResult.map) {
            mapsToChain.push(imageResult.map as unknown as EncodedSourceMap);
          }
          mapsToChain.push(hydrationMap as EncodedSourceMap);
          if (routeSplitMap) {
            mapsToChain.push(routeSplitMap);
          }
          const remapped = remapping(mapsToChain, () => null);

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
              routeSplitting && sourceAfterRouteSplit !== source ? 'routeSplit' : null,
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

      // ── .ts route file handler (production route splitting only) ──
      if (routeSplitting) {
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          const source = await Bun.file(args.path).text();

          // Fast bail-out: must contain both defineRoutes( and a vertz import
          if (!source.includes('defineRoutes(') || !source.includes('@vertz/ui')) {
            return { contents: source, loader: 'ts' };
          }

          const splitResult = transformRouteSplitting(source, args.path);

          if (splitResult.transformed && logger?.isEnabled('plugin')) {
            const relPath = relative(projectRoot, args.path);
            for (const d of splitResult.diagnostics) {
              logger.log('plugin', 'route-split', {
                file: relPath,
                route: d.routePath,
                import: d.importSource,
                symbol: d.symbolName,
              });
            }
            for (const s of splitResult.skipped) {
              logger.log('plugin', 'route-split-skip', {
                file: relPath,
                route: s.routePath,
                reason: s.reason,
              });
            }
          }

          // Append inline source map if the transform changed the code
          let contents = splitResult.code;
          if (splitResult.transformed && splitResult.map) {
            const mapBase64 = Buffer.from(splitResult.map.toString()).toString('base64');
            contents += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
          }

          return { contents, loader: 'ts' };
        });
      }
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

    // Update field selection manifest incrementally (.tsx for components, .ts for barrel re-exports)
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      fieldSelectionManifest.updateFile(filePath, sourceText);
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

    // Clean up field selection manifest
    fieldSelectionManifest.deleteFile(filePath);

    return existed;
  }

  function reloadEntitySchema(): boolean {
    const newSchema = loadEntitySchema(entitySchemaPath);
    const changed = JSON.stringify(newSchema) !== JSON.stringify(entitySchema);
    entitySchema = newSchema;

    if (logger?.isEnabled('fields')) {
      logger.log('fields', 'entity-schema-reload', {
        path: entitySchemaPath,
        entities: newSchema ? Object.keys(newSchema).length : 0,
        changed,
      });
    }

    return changed;
  }

  return {
    plugin,
    fileExtractions,
    cssSidecarMap,
    updateManifest,
    deleteManifest,
    reloadEntitySchema,
  };
}
