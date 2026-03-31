/**
 * Manifest resolver — builds the import graph and propagates reactivity
 * shapes across files.
 *
 * Responsibilities:
 * 1. Scan all .ts/.tsx files in src/
 * 2. Generate per-file manifests via analyzeFile()
 * 3. Resolve import paths (relative, tsconfig paths, extensions)
 * 4. Follow re-export chains
 * 5. Detect circular dependencies (classify as unknown with warning)
 * 6. Propagate reactivity shapes through the import graph
 *
 * @see plans/cross-file-reactivity-analysis.md Section 2.2.4
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { analyzeFile, type FileAnalysis, type ReExportRef } from './manifest-generator';
import { loadManifestFromJson } from './reactivity-manifest';
import type { LoadedReactivityManifest, ReactivityManifest } from './types';

/** Result of the full manifest generation pre-pass. */
export interface ManifestMap {
  /** Loaded manifests keyed by resolved file path or package name. */
  manifests: Map<string, LoadedReactivityManifest>;
  /** Circular dependency warnings. */
  warnings: ManifestWarning[];
  /** Time taken in ms. */
  durationMs: number;
}

export interface ManifestWarning {
  type: 'circular-dependency' | 'unknown-export';
  message: string;
  files?: string[];
}

/** Options for the manifest generation pre-pass. */
export interface GenerateManifestsOptions {
  /** Root directory to scan (typically `src/`). */
  srcDir: string;
  /** Pre-built manifests for packages (e.g., @vertz/ui). */
  packageManifests?: Record<string, ReactivityManifest>;
  /** tsconfig paths for alias resolution. */
  tsconfigPaths?: Record<string, string[]>;
  /** Base URL for tsconfig paths resolution. */
  baseUrl?: string;
}

/** File extensions to probe when resolving imports. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Index files to probe. */
const INDEX_FILES = EXTENSIONS.map((ext) => `index${ext}`);

/**
 * Generate manifests for all .ts/.tsx files in the source directory.
 *
 * This is the main entry point called at plugin construction time.
 */
export function generateAllManifests(options: GenerateManifestsOptions): ManifestMap {
  const startMs = performance.now();
  const warnings: ManifestWarning[] = [];

  // 1. Collect all source files
  const sourceFiles = collectSourceFiles(options.srcDir);

  // 2. Parse and analyze each file (single-file analysis)
  const fileAnalyses = new Map<string, FileAnalysis>();
  for (const filePath of sourceFiles) {
    try {
      const sourceText = readFileSync(filePath, 'utf-8');
      const analysis = analyzeFile(filePath, sourceText);
      fileAnalyses.set(filePath, analysis);
    } catch {
      // Skip files that can't be read (deleted between scan and read, permissions, etc.)
    }
  }

  // 3. Load pre-built package manifests
  const resolvedManifests = new Map<string, LoadedReactivityManifest>();
  if (options.packageManifests) {
    for (const [pkgName, manifest] of Object.entries(options.packageManifests)) {
      resolvedManifests.set(pkgName, loadManifestFromJson(manifest));
    }
  }

  // 4. Build the import graph and resolve re-exports
  const resolveCtx: ResolveContext = {
    fileAnalyses,
    resolvedManifests,
    tsconfigPaths: options.tsconfigPaths ?? {},
    baseUrl: options.baseUrl ?? options.srcDir,
    resolving: new Set(),
    warnings,
  };

  // Resolve all files — this propagates reactivity through re-exports
  for (const filePath of sourceFiles) {
    resolveFileManifest(filePath, resolveCtx);
  }

  const durationMs = performance.now() - startMs;
  return { manifests: resolvedManifests, warnings, durationMs };
}

/**
 * Generate manifest for a single file (for HMR updates).
 */
export function regenerateFileManifest(
  filePath: string,
  sourceText: string,
  existingManifests: Map<string, LoadedReactivityManifest>,
  options: Pick<GenerateManifestsOptions, 'tsconfigPaths' | 'baseUrl' | 'srcDir'>,
): { manifest: LoadedReactivityManifest; warnings: ManifestWarning[] } {
  const warnings: ManifestWarning[] = [];
  const analysis = analyzeFile(filePath, sourceText);

  const fileAnalyses = new Map<string, FileAnalysis>();
  fileAnalyses.set(filePath, analysis);

  // Delete stale entry so resolveFileManifest re-resolves from scratch
  existingManifests.delete(filePath);

  const resolveCtx: ResolveContext = {
    fileAnalyses,
    resolvedManifests: existingManifests,
    tsconfigPaths: options.tsconfigPaths ?? {},
    baseUrl: options.baseUrl ?? options.srcDir,
    resolving: new Set(),
    warnings,
  };

  resolveFileManifest(filePath, resolveCtx);
  return { manifest: existingManifests.get(filePath)!, warnings };
}

// ─── Internal Resolution ───────────────────────────────────────────

interface ResolveContext {
  fileAnalyses: Map<string, FileAnalysis>;
  resolvedManifests: Map<string, LoadedReactivityManifest>;
  tsconfigPaths: Record<string, string[]>;
  baseUrl: string;
  resolving: Set<string>; // For circular dependency detection
  warnings: ManifestWarning[];
}

/**
 * Resolve a file's manifest, following re-exports and propagating shapes.
 */
function resolveFileManifest(
  filePath: string,
  ctx: ResolveContext,
): LoadedReactivityManifest | undefined {
  // Already resolved
  if (ctx.resolvedManifests.has(filePath)) {
    return ctx.resolvedManifests.get(filePath);
  }

  // Circular dependency detection — produce manifest with unknown exports
  if (ctx.resolving.has(filePath)) {
    ctx.warnings.push({
      type: 'circular-dependency',
      message: `Circular dependency detected involving ${filePath}. Exports in the cycle are treated as unknown.`,
      files: [...ctx.resolving],
    });
    const analysis = ctx.fileAnalyses.get(filePath);
    if (analysis) {
      const unknownExports: Record<string, ReactivityManifest['exports'][string]> = {};
      for (const name of Object.keys(analysis.manifest.exports)) {
        unknownExports[name] = { kind: 'function', reactivity: { type: 'unknown' } };
      }
      const unknownManifest = loadManifestFromJson({
        version: 1,
        filePath,
        exports: unknownExports,
      });
      ctx.resolvedManifests.set(filePath, unknownManifest);
      return unknownManifest;
    }
    return undefined;
  }

  const analysis = ctx.fileAnalyses.get(filePath);
  if (!analysis) return undefined;

  ctx.resolving.add(filePath);

  // Resolve re-exports
  const resolvedExports = { ...analysis.manifest.exports };

  for (const reExport of analysis.reExports) {
    resolveReExport(reExport, filePath, resolvedExports, ctx);
  }

  const manifest: ReactivityManifest = {
    version: 1,
    filePath,
    exports: resolvedExports,
  };

  const loaded = loadManifestFromJson(manifest);
  ctx.resolvedManifests.set(filePath, loaded);
  ctx.resolving.delete(filePath);

  return loaded;
}

function resolveReExport(
  reExport: ReExportRef,
  fromFile: string,
  resolvedExports: Record<string, ReactivityManifest['exports'][string]>,
  ctx: ResolveContext,
): void {
  const resolvedPath = resolveModuleSpecifier(
    reExport.moduleSpecifier,
    fromFile,
    ctx.tsconfigPaths,
    ctx.baseUrl,
  );

  if (!resolvedPath) return;

  // Resolve the target file's manifest first
  const targetManifest =
    resolveFileManifest(resolvedPath, ctx) ?? ctx.resolvedManifests.get(resolvedPath);

  if (!targetManifest) return;

  if (reExport.exportName === '*') {
    // Star re-export: export * from './bar'
    for (const [name, info] of Object.entries(targetManifest.exports)) {
      if (!(name in resolvedExports)) {
        resolvedExports[name] = {
          kind: info.kind,
          reactivity: info.reactivity,
        };
      }
    }
  } else {
    // Named re-export: export { foo } from './bar' or export { foo as bar } from './bar'
    const targetExport = targetManifest.exports[reExport.originalName];
    if (targetExport) {
      resolvedExports[reExport.exportName] = {
        kind: targetExport.kind,
        reactivity: targetExport.reactivity,
      };
    }
  }
}

// ─── Import Resolution ─────────────────────────────────────────────

/**
 * Resolve a module specifier to an absolute file path.
 *
 * Handles:
 * - Relative imports (./foo, ../bar) with extension probing
 * - tsconfig paths aliases
 * - Package imports (returns the specifier as-is for package manifest lookup)
 */
export function resolveModuleSpecifier(
  specifier: string,
  fromFile: string,
  tsconfigPaths: Record<string, string[]>,
  baseUrl: string,
): string | undefined {
  // Relative import
  if (specifier.startsWith('.')) {
    const dir = dirname(fromFile);
    const base = resolve(dir, specifier);
    return probeFile(base);
  }

  // tsconfig paths
  for (const [pattern, replacements] of Object.entries(tsconfigPaths)) {
    const match = matchTsconfigPath(specifier, pattern);
    if (match !== null) {
      for (const replacement of replacements) {
        const resolved = resolve(baseUrl, replacement.replace('*', match));
        const probed = probeFile(resolved);
        if (probed) return probed;
      }
    }
  }

  // Package import — return as-is (lookup happens against package manifests)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return specifier;
  }

  return undefined;
}

/**
 * Probe for a file with extension variants.
 * Given `/path/to/foo`, tries:
 * - /path/to/foo.ts, .tsx, .js, .jsx
 * - /path/to/foo/index.ts, /index.tsx, etc.
 * - /path/to/foo (exact)
 */
function probeFile(basePath: string): string | undefined {
  // Exact match (already has extension)
  if (isFile(basePath)) {
    return basePath;
  }

  // Extension probing
  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext;
    if (isFile(candidate)) {
      return candidate;
    }
  }

  // Directory index probing
  if (isDirectory(basePath)) {
    for (const indexFile of INDEX_FILES) {
      const candidate = join(basePath, indexFile);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Match a specifier against a tsconfig path pattern.
 * Returns the matched wildcard portion, or null if no match.
 *
 * Pattern: "@/*" matches "@/hooks/foo" → "hooks/foo"
 * Pattern: "utils" matches "utils" → ""
 */
function matchTsconfigPath(specifier: string, pattern: string): string | null {
  if (pattern.includes('*')) {
    const [prefix, suffix] = pattern.split('*') as [string, string];
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
      return specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    return null;
  }
  return specifier === pattern ? '' : null;
}

// ─── File Collection ───────────────────────────────────────────────

/**
 * Recursively collect all .ts/.tsx files in a directory.
 * Excludes node_modules, dist, and test files.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  collectFilesRecursive(dir, files);
  return files;
}

function collectFilesRecursive(dir: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.vertz') continue;

    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectFilesRecursive(fullPath, files);
      } else if (stat.isFile()) {
        // Include .ts and .tsx but skip test files and declaration files
        if (
          (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
          !entry.endsWith('.test.ts') &&
          !entry.endsWith('.test.tsx') &&
          !entry.endsWith('.test-d.ts') &&
          !entry.endsWith('.spec.ts') &&
          !entry.endsWith('.spec.tsx') &&
          !entry.endsWith('.d.ts')
        ) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip files we can't stat
    }
  }
}
