/**
 * AOT Manifest Build — Generate AOT compilation manifest at build time.
 *
 * Scans all TSX files in the source directory, runs compileForSsrAot()
 * on each, and collects per-component classification and hole info.
 *
 * Used by the production build pipeline (`buildUI()`) to generate
 * `aot-manifest.json`, `aot-routes.js`, and log per-component classification stats.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AotComponentInfo } from './compiler/types';
import { compileForSsrAot } from './compiler/native-compiler';

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
  /** Extracted CSS rule blocks from static css() calls (#1989). */
  css?: string[];
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
  /** Pre-filtered CSS rules for this route, determined at build time (#1988).
   *  Includes only rules whose class selectors appear in the component's __ssr_* function. */
  css?: string[];
}

export interface AotBuildManifest {
  components: Record<string, AotBuildComponentEntry>;
  /** Compiled files keyed by source file path. */
  compiledFiles: Record<string, AotCompiledFile>;
  classificationLog: string[];
  /** Aggregated CSS from all compiled files (#1989). */
  css: string[];
}

/**
 * Scan all TSX files in srcDir and generate an AOT build manifest.
 */
export function generateAotBuildManifest(srcDir: string): AotBuildManifest {
  const components: Record<string, AotBuildComponentEntry> = {};
  const compiledFiles: Record<string, AotCompiledFile> = {};
  const classificationLog: string[] = [];
  const cssSet = new Set<string>();
  const tsxFiles = collectTsxFiles(srcDir);

  for (const filePath of tsxFiles) {
    try {
      const source = readFileSync(filePath, 'utf-8');
      const result = compileForSsrAot(source, { filename: filePath });

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
          css: result.css,
        };
      }

      // Collect individual CSS rules from all files (#1989).
      // Individual rules enable per-rule filtering in SSR (#1988).
      if (result.css) {
        for (const rule of result.css) cssSet.add(rule);
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

  return { components, compiledFiles, classificationLog, css: [...cssSet] };
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
  /** Function names skipped due to residual JSX in compiled output. */
  skippedFns: string[];
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
  appEntry?: AotRouteMapEntry,
): AotBarrelResult {
  // Collect all render function names needed
  const neededFns = new Set<string>();
  for (const entry of Object.values(routeMap)) {
    neededFns.add(entry.renderFn);
  }
  if (appEntry) {
    neededFns.add(appEntry.renderFn);
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
  const skippedFns: string[] = [];
  let fileIndex = 0;
  for (const [filePath, fns] of fileToFns) {
    // Use relative module name based on source file basename
    const moduleName = basename(filePath, '.tsx').replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempFileName = `__aot_${fileIndex}_${moduleName}`;
    // Use .ts extension in re-exports — required for Node ESM which doesn't
    // resolve extensionless TypeScript imports. Bun handles .ts natively.
    const moduleRef = `./${tempFileName}.ts`;
    lines.push(`export { ${fns.sort().join(', ')} } from '${moduleRef}';`);

    // Extract only the __ssr_* functions from compiled code — NOT the original source.
    // The original source has imports and side effects (createRouter, themeGlobals, etc.)
    // that would pull entire dependency graphs into the barrel bundle (#1982).
    // Use .ts extension — extracted functions are pure string concatenation, no JSX.
    const compiled = compiledFiles[filePath];
    if (compiled) {
      const helperImport =
        "import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server';\n" +
        "import type { SSRAotContext } from '@vertz/ui-server';\n";
      const extracted = extractSsrFunctions(compiled.code, fns);

      // Validate: skip functions with residual JSX that wasn't compiled to
      // string concatenation. The native compiler may leave JSX inside .map()
      // callbacks untransformed — bundling these as .ts would fail (#1914).
      if (hasResidualJsx(extracted)) {
        // Remove these functions from the barrel — they fall back to runtime SSR
        lines.pop(); // remove the export line we just added
        skippedFns.push(...fns);
      } else {
        files[`${tempFileName}.ts`] = helperImport + extracted;
      }
    }

    fileIndex++;
  }

  return {
    barrelSource: lines.join('\n'),
    files,
    skippedFns,
  };
}

/**
 * Extract only the named `__ssr_*` function declarations from compiled source code.
 *
 * The AOT compiler appends `export function __ssr_Name(...) { ... }` to the
 * original source. We extract ONLY these functions to avoid pulling in the
 * original imports and side effects (createRouter, themeGlobals, etc.) that
 * would bloat the bundle (#1982).
 */
export function extractSsrFunctions(code: string, fnNames: string[]): string {
  const extracted: string[] = [];

  for (const fnName of fnNames) {
    // Find `export function __ssr_Name(` in the source
    const marker = `export function ${fnName}(`;
    const startIdx = code.indexOf(marker);
    if (startIdx === -1) continue;

    // Walk forward from the opening `{` counting braces to find the function end
    const bodyStart = code.indexOf('{', startIdx + marker.length);
    if (bodyStart === -1) continue;

    let depth = 1;
    let i = bodyStart + 1;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }

    extracted.push(code.slice(startIdx, i));
  }

  return extracted.join('\n');
}

/**
 * Check if extracted code contains residual JSX that wasn't compiled to
 * string concatenation. The native compiler may leave JSX inside .map()
 * callbacks untransformed — these functions can't be bundled as .ts files.
 *
 * Detects JSX attribute expressions like `className={expr}` which only
 * appear in raw JSX, not in string-concatenation AOT output.
 */
export function hasResidualJsx(code: string): boolean {
  // Match JSX attribute expressions: name={...} that aren't inside string literals.
  // AOT string-concat code uses __esc_attr() helpers, never raw className={}.
  return /\bclassName=\{/.test(code);
}

/**
 * Find the root layout (App) component — the one with RouterView as a hole.
 *
 * Returns the component name and its AOT route map entry, or undefined if
 * no component has a RouterView hole or it's a runtime-fallback.
 */
export function findAppComponent(
  components: Record<string, AotBuildComponentEntry>,
): AotRouteMapEntry | undefined {
  for (const [name, comp] of Object.entries(components)) {
    if (comp.tier === 'runtime-fallback') continue;
    if (comp.holes.includes('RouterView')) {
      return {
        renderFn: `__ssr_${name}`,
        holes: comp.holes,
        queryKeys: comp.queryKeys,
      };
    }
  }
  return undefined;
}

/**
 * Attach pre-filtered CSS rules to each route entry at build time (#1988, #1989).
 *
 * Transitively collects CSS from the full component tree: the route's own
 * `__ssr_*` function, all local child `__ssr_*` calls it invokes, AND all
 * hole components (imported from other files). This is critical for non-Bun
 * bundlers (esbuild/workerd) where `getInjectedCSS()` doesn't work because
 * `css()` side effects land in a different module instance or are tree-shaken.
 *
 * Also attaches CSS to the app entry (root layout) so the runtime can
 * merge app + route CSS with a simple concat.
 */
export function attachPerRouteCss(
  compiledFiles: Record<string, AotCompiledFile>,
  routeMap: Record<string, AotRouteMapEntry>,
  appEntry?: AotRouteMapEntry,
): void {
  // 1. Build className → CSS rule map from all compiled files
  const classToRule = new Map<string, string>();
  for (const file of Object.values(compiledFiles)) {
    if (!file.css) continue;
    for (const rule of file.css) {
      const match = /\.(_[0-9a-f]{8})/.exec(rule);
      if (match) classToRule.set(match[1]!, rule);
    }
  }

  if (classToRule.size === 0) return;

  // 2. Build componentName → __ssr_* function code AND componentName → holes
  const componentCode = new Map<string, string>();
  const componentHoles = new Map<string, string[]>();
  for (const file of Object.values(compiledFiles)) {
    for (const comp of file.components) {
      const fnName = `__ssr_${comp.name}`;
      const code = extractSsrFunctions(file.code, [fnName]);
      if (code) componentCode.set(comp.name, code);
      if (comp.holes.length > 0) componentHoles.set(comp.name, comp.holes);
    }
  }

  // 3. Helper: find CSS rules referenced by class names in code
  const classNamePattern = /_([\da-f]{8})/g;
  function findUsedCss(code: string, seenClasses: Set<string>): string[] {
    const rules: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = classNamePattern.exec(code)) !== null) {
      const cls = `_${m[1]}`;
      if (seenClasses.has(cls)) continue;
      seenClasses.add(cls);
      const rule = classToRule.get(cls);
      if (rule) rules.push(rule);
    }
    classNamePattern.lastIndex = 0;
    return rules;
  }

  // 4. Helper: transitively collect CSS for a component and all its children.
  //    Follows __ssr_* calls (local children) and ctx.holes.* (imported children).
  //    On workerd, hole components' css() side effects are tree-shaken, so we
  //    must include their CSS statically from the build manifest.
  function collectTreeCss(rootName: string): string[] {
    const allRules: string[] = [];
    const seenClasses = new Set<string>();
    const visited = new Set<string>();
    const queue = [rootName];

    while (queue.length > 0) {
      const name = queue.pop()!;
      if (visited.has(name)) continue;
      visited.add(name);

      // Collect CSS from this component's __ssr_* function code
      const code = componentCode.get(name);
      if (code) {
        allRules.push(...findUsedCss(code, seenClasses));

        // Find local __ssr_* calls: __ssr_ChildName(
        const localCallPattern = /__ssr_(\w+)\(/g;
        let lm: RegExpExecArray | null;
        while ((lm = localCallPattern.exec(code)) !== null) {
          const childName = lm[1]!;
          if (!visited.has(childName)) queue.push(childName);
        }
      }

      // Follow holes (imported components from other files)
      const holes = componentHoles.get(name);
      if (holes) {
        for (const hole of holes) {
          if (!visited.has(hole)) queue.push(hole);
        }
      }
    }

    return allRules;
  }

  // 5. Attach CSS to app entry (root layout)
  if (appEntry) {
    const appName = appEntry.renderFn.replace(/^__ssr_/, '');
    const appCss = collectTreeCss(appName);
    if (appCss.length > 0) appEntry.css = appCss;
  }

  // 6. Attach per-route CSS (full component tree — app CSS merged at runtime)
  for (const entry of Object.values(routeMap)) {
    const compName = entry.renderFn.replace(/^__ssr_/, '');
    const routeCss = collectTreeCss(compName);
    if (routeCss.length > 0) entry.css = routeCss;
  }
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
