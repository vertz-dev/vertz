/**
 * AOT Manifest Build — Generate AOT compilation manifest at build time.
 *
 * Scans all TSX files in the source directory, runs compileForSSRAot()
 * on each, and collects per-component classification and hole info.
 *
 * Used by the production build pipeline (`buildUI()`) to generate
 * `aot-manifest.json`, `aot-routes.js`, and log per-component classification stats.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AotComponentInfo } from '@vertz/ui-compiler';
import { compileForSSRAot } from '@vertz/ui-compiler';

export interface AotBuildComponentEntry {
  tier: 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';
  holes: string[];
  queryKeys: string[];
}

/** Compiled file output from AOT compilation. */
export interface AotCompiledFile {
  /** Transformed source code containing __ssr_* functions. */
  code: string;
  /** Per-component AOT info from the compilation. */
  components: AotComponentInfo[];
}

/** Route map entry for the AOT manifest JSON. */
export interface AotRouteMapEntry {
  /** Name of the __ssr_* render function (e.g., '__ssr_HomePage'). */
  renderFn: string;
  /** Component names that need runtime fallback rendering. */
  holes: string[];
  /** Query cache keys this route reads via ctx.getData(). May contain ${paramName} placeholders. */
  queryKeys: string[];
  /** Route param names referenced in queryKeys. Present only when queryKeys have ${...} placeholders. */
  paramBindings?: string[];
}

export interface AotBuildManifest {
  components: Record<string, AotBuildComponentEntry>;
  /** Compiled files keyed by source file path. */
  compiledFiles: Record<string, AotCompiledFile>;
  classificationLog: string[];
}

/**
 * Scan all TSX files in srcDir and generate an AOT build manifest.
 */
export function generateAotBuildManifest(srcDir: string): AotBuildManifest {
  const components: Record<string, AotBuildComponentEntry> = {};
  const compiledFiles: Record<string, AotCompiledFile> = {};
  const classificationLog: string[] = [];
  const tsxFiles = collectTsxFiles(srcDir);

  for (const filePath of tsxFiles) {
    try {
      const source = readFileSync(filePath, 'utf-8');
      const result = compileForSSRAot(source, { filename: filePath });

      for (const comp of result.components) {
        components[comp.name] = {
          tier: comp.tier,
          holes: comp.holes,
          queryKeys: comp.queryKeys,
        };
      }

      // Preserve compiled code for AOT module emission
      if (result.components.length > 0) {
        compiledFiles[filePath] = {
          code: result.code,
          components: result.components,
        };
      }
    } catch (e) {
      classificationLog.push(
        `⚠ ${filePath}: ${e instanceof Error ? e.message : 'compilation failed'}`,
      );
    }
  }

  // Generate classification log
  let aotCount = 0;
  let runtimeCount = 0;

  for (const [name, entry] of Object.entries(components)) {
    let line = `${name}: ${entry.tier}`;
    if (entry.holes.length > 0) {
      const holeLabel = entry.holes.length === 1 ? 'hole' : 'holes';
      line += `, ${entry.holes.length} ${holeLabel} (${entry.holes.join(', ')})`;
    }
    classificationLog.push(line);

    if (entry.tier === 'runtime-fallback') {
      runtimeCount++;
    } else {
      aotCount++;
    }
  }

  const total = aotCount + runtimeCount;
  if (total > 0) {
    const pct = Math.round((aotCount / total) * 100);
    classificationLog.push(`Coverage: ${aotCount}/${total} components (${pct}%)`);
  }

  return { components, compiledFiles, classificationLog };
}

/**
 * Build AOT route map — maps route patterns to render function names.
 *
 * Skips routes for runtime-fallback components (they can't be AOT-rendered)
 * and routes for unknown components (not found in AOT manifest).
 */
export function buildAotRouteMap(
  components: Record<string, AotBuildComponentEntry>,
  routes: Array<{ pattern: string; componentName: string }>,
): Record<string, AotRouteMapEntry> {
  const routeMap: Record<string, AotRouteMapEntry> = {};

  for (const route of routes) {
    const comp = components[route.componentName];
    if (!comp || comp.tier === 'runtime-fallback') continue;

    // Extract param names from ${...} placeholders in queryKeys
    const paramNames = new Set<string>();
    for (const key of comp.queryKeys) {
      const matches = key.matchAll(/\$\{(\w+)\}/g);
      for (const m of matches) {
        paramNames.add(m[1]!);
      }
    }

    const entry: AotRouteMapEntry = {
      renderFn: `__ssr_${route.componentName}`,
      holes: comp.holes,
      queryKeys: comp.queryKeys,
    };

    if (paramNames.size > 0) {
      entry.paramBindings = [...paramNames];
    }

    routeMap[route.pattern] = entry;
  }

  return routeMap;
}

/** Result of barrel generation — barrel source + file mapping for temp dir. */
export interface AotBarrelResult {
  /** Barrel module source code (import/re-export statements). */
  barrelSource: string;
  /**
   * Mapping of temp file names → compiled source code.
   * Write each entry as `<tempDir>/<filename>.ts` alongside the barrel.
   */
  files: Record<string, string>;
}

/**
 * Generate a barrel module that re-exports __ssr_* functions from compiled files.
 *
 * Returns the barrel source code and a mapping of temp filenames → compiled code
 * that must be written alongside the barrel for bundling.
 */
export function generateAotBarrel(
  compiledFiles: Record<string, AotCompiledFile>,
  routeMap: Record<string, AotRouteMapEntry>,
): AotBarrelResult {
  // Collect all render function names needed
  const neededFns = new Set<string>();
  for (const entry of Object.values(routeMap)) {
    neededFns.add(entry.renderFn);
  }

  // Map function names → source file paths
  const fnToFile = new Map<string, string>();
  for (const [filePath, compiled] of Object.entries(compiledFiles)) {
    for (const comp of compiled.components) {
      const fnName = `__ssr_${comp.name}`;
      if (neededFns.has(fnName)) {
        fnToFile.set(fnName, filePath);
      }
    }
  }

  // Generate import/export lines grouped by source file
  const fileToFns = new Map<string, string[]>();
  for (const [fnName, filePath] of fnToFile) {
    const existing = fileToFns.get(filePath) ?? [];
    existing.push(fnName);
    fileToFns.set(filePath, existing);
  }

  // Import AOT runtime helpers used by all __ssr_* functions
  const lines: string[] = [
    "import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server';",
  ];
  const files: Record<string, string> = {};
  let fileIndex = 0;
  for (const [filePath, fns] of fileToFns) {
    // Use relative module name based on source file basename
    const moduleName = basename(filePath, '.tsx').replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempFileName = `__aot_${fileIndex}_${moduleName}`;
    const moduleRef = `./${tempFileName}`;
    lines.push(`export { ${fns.sort().join(', ')} } from '${moduleRef}';`);

    // Map the temp filename to the compiled source code.
    // Use .tsx extension because compiled code includes the original source (with JSX)
    // alongside the generated __ssr_* functions.
    // Each file needs its own helper import — the barrel's import doesn't flow into re-exported modules.
    const compiled = compiledFiles[filePath];
    if (compiled) {
      const helperImport =
        "import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server';\n";
      files[`${tempFileName}.tsx`] = helperImport + compiled.code;
    }

    fileIndex++;
  }

  return {
    barrelSource: lines.join('\n'),
    files,
  };
}

/** Recursively collect all .tsx files in a directory. */
function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}
