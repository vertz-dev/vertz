/**
 * Unified production-build plugin for Vertz UI compilation with optional HMR and Fast Refresh.
 *
 * Pipeline:
 * 1. Image transform (detects <Image>, processes images, replaces with <picture>)
 * 2. Field selection injection (analyzes field access, injects select into queries)
 * 3. Context stable IDs (if fastRefresh — injects __stableId for HMR)
 * 4. Island ID injection (auto-generates id prop for <Island> elements)
 * 5. Native compile (reactive signals + JSX + hydration + route splitting + CSS)
 * 6. Source map chaining — remapping([compile, image]) (output→source order)
 * 7. CSS extraction → sidecar file (if CSS found)
 * 8. Fast Refresh wrappers (if fastRefresh — component tracking + registration)
 * 9. import.meta.hot.accept() (if hmr — self-accept HMR updates)
 * 10. Assemble final output with inline source map
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import type { EncodedSourceMap } from '@ampproject/remapping';
import remapping from '@ampproject/remapping';
import type { LoadedReactivityManifest } from '../compiler/types';
import type { ReactivityManifest } from '../compiler/types';
import { compile as nativeCompile } from '../compiler/native-compiler';
import type { ManifestEntry } from '../compiler/native-compiler';
import {
  generateAllManifests,
  regenerateFileManifest,
  resolveModuleSpecifier,
} from '../compiler/manifest-resolver';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import ts from 'typescript';
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
  VertzBuildPluginOptions,
  VertzBuildPluginResult,
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
 * Convert loaded reactivity manifests to native compiler ManifestEntry array.
 */
function convertManifestsToEntries(
  manifests: Map<string, LoadedReactivityManifest>,
): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const [specifier, manifest] of manifests) {
    for (const [exportName, info] of Object.entries(manifest.exports)) {
      if (info.reactivity.type === 'signal-api') {
        entries.push({
          moduleSpecifier: specifier,
          exportName,
          reactivityType: info.reactivity.type,
          signalProperties: [...info.reactivity.signalProperties],
          plainProperties: [...info.reactivity.plainProperties],
          fieldSignalProperties: info.reactivity.fieldSignalProperties
            ? [...info.reactivity.fieldSignalProperties]
            : undefined,
        });
      } else if (info.reactivity.type !== 'static') {
        entries.push({
          moduleSpecifier: specifier,
          exportName,
          reactivityType: info.reactivity.type,
        });
      }
    }
  }
  return entries;
}

/**
 * Create the Vertz production-build plugin with CSS sidecar support and optional Fast Refresh.
 *
 * Why "Build" and not "Bun": the factory returns a `BunPlugin`-shaped object for
 * structural compatibility with the production build toolchain, but its purpose
 * (production build integration) — not its runtime — drives the name. Dev is
 * vtz (Rust + V8); only the production build pipeline consumes this factory.
 *
 * Returns the plugin along with maps for CSS extractions and sidecar paths,
 * which build scripts need for dead CSS elimination.
 */
export function createVertzBuildPlugin(options?: VertzBuildPluginOptions): VertzBuildPluginResult {
  const filter = options?.filter ?? /\.tsx$/;
  const hmr = options?.hmr ?? true;
  const fastRefresh = options?.fastRefresh ?? hmr;
  const routeSplitting = options?.routeSplitting ?? false;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const cssOutDir = options?.cssOutDir ?? resolve(projectRoot, '.vertz', 'css');
  const logger = options?.logger;
  const diagnostics = options?.diagnostics;

  const fileExtractions: FileExtractionsMap = new Map();
  const cssSidecarMap: CSSSidecarMap = new Map();

  // ── 0. Manifest generation pre-pass (cross-file reactivity) ──────
  // Generate reactivity manifests for all source files at plugin construction
  // time. This enables the compiler to understand the reactivity shape of
  // imports from user files (custom hooks, barrel re-exports, etc.).
  const srcDir = options?.srcDir ?? resolve(projectRoot, 'src');
  // Load the raw JSON manifest to avoid Set→Array round-trip. `createRequire`
  // gives us a real CJS require in ESM-bundled output where the global
  // `require` is not defined.
  const esmRequire = createRequire(import.meta.url);
  const frameworkManifestJson = esmRequire(
    esmRequire.resolve('@vertz/ui/reactivity.json'),
  ) as ReactivityManifest;
  const manifestResult = generateAllManifests({
    srcDir,
    packageManifests: { '@vertz/ui': frameworkManifestJson, 'vertz/ui': frameworkManifestJson },
  });

  // Mutable manifest map — HMR updates can modify it
  const manifests: Map<string, LoadedReactivityManifest> = manifestResult.manifests;

  // Cached ManifestEntry array — rebuilt only when dirty
  let cachedManifestEntries: ManifestEntry[] | null = null;
  const getManifestEntries = (): ManifestEntry[] => {
    if (cachedManifestEntries) return cachedManifestEntries;
    cachedManifestEntries = convertManifestsToEntries(manifests);
    return cachedManifestEntries;
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
    name: 'vertz-build-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        try {
          const startMs = logger?.isEnabled('plugin') ? performance.now() : 0;
          const source = await Bun.file(args.path).text();
          const relPath = relative(projectRoot, args.path);

          logger?.log('plugin', 'onLoad', { file: relPath, bytes: source.length });

          // ── 1. Image transform ────────────────────────────────────
          const imageOutputDir = resolve(projectRoot, '.vertz', 'images');
          const imageQueue: Array<{
            sourcePath: string;
            width: number;
            height: number;
            quality: number;
            fit: string;
            outputDir: string;
          }> = [];

          const imageResult = transformImages(source, args.path, {
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

          // ── 2. Field selection injection ───────────────────────
          // Analyze field access and inject select into query descriptors
          // Uses cross-file manifest to merge child component fields
          const fieldSelectionResult = injectFieldSelection(args.path, codeAfterImageTransform, {
            manifest: fieldSelectionManifest,
            resolveImport: fieldSelectionResolveImport,
            entitySchema,
          });
          const codeAfterFieldSelection = fieldSelectionResult.code;

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

          // ── 3. Context stable IDs + Island ID injection ──────────
          // Create a lightweight TypeScript SourceFile for AST-based pre-transforms
          let codeForCompile = codeAfterFieldSelection;
          {
            const preTransformS = new MagicString(codeAfterFieldSelection);
            const tsSourceFile = ts.createSourceFile(
              args.path,
              codeAfterFieldSelection,
              ts.ScriptTarget.Latest,
              true,
              ts.ScriptKind.TSX,
            );

            if (fastRefresh) {
              const relFilePath = relative(projectRoot, args.path);
              injectContextStableIds(preTransformS, tsSourceFile, relFilePath);
            }

            {
              const relFilePath = relative(projectRoot, args.path);
              injectIslandIds(preTransformS, tsSourceFile, relFilePath);
            }

            if (preTransformS.hasChanged()) {
              codeForCompile = preTransformS.toString();
            }
          }

          // ── 4. Native compile (reactive + JSX + hydration + route splitting + CSS) ──
          const compileResult = nativeCompile(codeForCompile, {
            filename: args.path,
            target: options?.target,
            hydrationMarkers: true,
            fastRefresh: false,
            routeSplitting,
            manifests: getManifestEntries(),
          });

          const compileMap: EncodedSourceMap = compileResult.map
            ? (JSON.parse(compileResult.map) as EncodedSourceMap)
            : ({ version: 3, sources: [], mappings: '', names: [] } as EncodedSourceMap);

          // ── 5. Source map chaining ──────────────────────────────
          // Chain maps in output→source order: compile → image
          const mapsToChain: EncodedSourceMap[] = [compileMap];
          if (imageResult.map) {
            mapsToChain.push(imageResult.map as unknown as EncodedSourceMap);
          }
          const remapped = remapping(mapsToChain, () => null);

          // ── 6. CSS extraction → sidecar file ───────────────────
          const extraction: { css: string; blockNames: string[] } = compileResult.css
            ? { css: compileResult.css, blockNames: [] }
            : { css: '', blockNames: [] };
          let cssImportLine = '';

          // When native compiler extracted CSS, we need to inject it at runtime
          // so SSR's getInjectedCSS() can collect it. The native compiler replaces
          // css() calls with plain class-name objects, skipping runtime injection.
          let nativeCssInjection = '';
          if (compileResult.css && extraction.css.length > 0) {
            // Escape the CSS for embedding in a JS string
            const escaped = extraction.css
              .replace(/\\/g, '\\\\')
              .replace(/`/g, '\\`')
              .replace(/\$/g, '\\$');
            nativeCssInjection = `import { injectCSS as __injectCSS } from '@vertz/ui';\n__injectCSS(\`${escaped}\`);\n`;
          }

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
              const relCssPath = relative(dirname(args.path), cssFilePath);
              const importPath = relCssPath.startsWith('.') ? relCssPath : `./${relCssPath}`;
              cssImportLine = `import '${importPath}';\n`;
            }
          }

          // ── 7. Fast Refresh: detect components and inject wrappers ──
          let refreshPreamble = '';
          let refreshEpilogue = '';

          if (fastRefresh && compileResult.components && compileResult.components.length > 0) {
            const componentInfos = compileResult.components.map((c) => ({
              name: c.name,
              propsParam: null as string | null,
              hasDestructuredProps: false,
              bodyStart: c.bodyStart,
              bodyEnd: c.bodyEnd,
            }));
            const refreshCode = generateRefreshCode(args.path, componentInfos, source);
            if (refreshCode) {
              refreshPreamble = refreshCode.preamble;
              refreshEpilogue = refreshCode.epilogue;
            }
          }

          // ── 8. Assemble output ─────────────────────────────────

          // Count lines prepended before compileResult.code so we can
          // offset the source map. Without this, breakpoints land on
          // the wrong line in browser DevTools.
          let contents = '';
          if (nativeCssInjection) {
            contents += nativeCssInjection;
          }
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
            // The `if` guard is safe — Bun's static analysis detects accept()
            // inside if-guards. It MUST NOT use optional chaining or variable
            // indirection. The guard is needed because this code also runs on
            // the server side where import.meta.hot is undefined.
            contents += '\nif (import.meta.hot) import.meta.hot.accept();\n';
          }

          contents += sourceMapComment;

          if (logger?.isEnabled('plugin')) {
            const durationMs = Math.round(performance.now() - startMs);
            const stages = [
              'compile',
              routeSplitting ? 'routeSplit' : null,
              fastRefresh ? 'stableIds' : null,
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
          console.error(`[vertz-build-plugin] Failed to process ${relPath}:`, message);
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
      cachedManifestEntries = null; // Invalidate cached ManifestEntry array
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
      cachedManifestEntries = null; // Invalidate cached ManifestEntry array

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
