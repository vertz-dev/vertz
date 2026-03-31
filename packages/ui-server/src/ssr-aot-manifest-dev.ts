/**
 * In-memory AOT manifest manager for the dev server.
 *
 * Holds AOT compilation results in memory and rebuilds incrementally
 * when component files change. Provides atomic read access for
 * concurrent SSR requests.
 *
 * Follows the same pattern as PrefetchManifestManager.
 */
import { compileForSsrAot } from './compiler/native-compiler';
import { AotDiagnostics } from './ssr-aot-diagnostics';

/** Per-component entry in the dev AOT manifest. */
export interface AotDevComponentEntry {
  tier: 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';
  holes: string[];
  /** The file this component was compiled from. */
  file: string;
}

/** Dev-mode AOT manifest — tracks all components across all files. */
export interface AotDevManifest {
  components: Record<string, AotDevComponentEntry>;
}

export interface AotManifestSnapshot {
  manifest: AotDevManifest | null;
  rebuildCount: number;
  lastRebuildMs: number | null;
  lastRebuildAt: string | null;
}

export interface AotManifestManagerOptions {
  /** Read a file's contents. Returns undefined if file doesn't exist. */
  readFile: (path: string) => string | undefined;
  /** List all files in the source directory (absolute paths). */
  listFiles: () => string[];
}

export interface AotManifestManager {
  /** Initial full build — compile all TSX files. */
  build(): void;
  /** Handle a file change — recompile a single file. */
  onFileChange(filePath: string, sourceText: string): void;
  /** Get the current manifest (atomic read). */
  getManifest(): AotDevManifest | null;
  /** Get diagnostic snapshot for endpoints. */
  getSnapshot(): AotManifestSnapshot;
  /** Get AotDiagnostics instance for the diagnostics endpoint. */
  getDiagnostics(): AotDiagnostics;
}

export function createAotManifestManager(options: AotManifestManagerOptions): AotManifestManager {
  const { readFile, listFiles } = options;

  // Atomic references — replaced, never mutated
  let currentManifest: AotDevManifest | null = null;

  // Diagnostics tracker
  const diagnostics = new AotDiagnostics();

  // Metadata
  let rebuildCount = 0;
  let lastRebuildMs: number | null = null;
  let lastRebuildAt: string | null = null;

  /** Compile a single TSX file and return its component entries. */
  function compileFile(
    filePath: string,
    source: string,
  ): Array<{ name: string; entry: AotDevComponentEntry }> {
    try {
      const result = compileForSsrAot(source, { filename: filePath });
      return result.components.map((comp) => ({
        name: comp.name,
        entry: {
          tier: comp.tier,
          holes: comp.holes,
          file: filePath,
        },
      }));
    } catch {
      // Compilation failed — skip this file
      return [];
    }
  }

  function updateDiagnostics(manifest: AotDevManifest, isFullBuild: boolean): void {
    if (isFullBuild) {
      diagnostics.clear();
    } else {
      diagnostics.clearComponents();
    }
    const entries = Object.entries(manifest.components).map(([name, entry]) => ({
      name,
      tier: entry.tier,
      holes: entry.holes,
    }));
    diagnostics.recordCompilation(entries);
  }

  function fullBuild(): void {
    const start = performance.now();
    const files = listFiles();
    const components: Record<string, AotDevComponentEntry> = {};

    for (const filePath of files) {
      if (!filePath.endsWith('.tsx')) continue;

      const source = readFile(filePath);
      if (!source) continue;

      const entries = compileFile(filePath, source);
      for (const { name, entry } of entries) {
        components[name] = entry;
      }
    }

    // Atomic swap
    currentManifest = { components };
    updateDiagnostics(currentManifest, true);
    rebuildCount++;
    lastRebuildMs = Math.round(performance.now() - start);
    lastRebuildAt = new Date().toISOString();
  }

  function incrementalUpdate(filePath: string, sourceText: string): void {
    if (!currentManifest) return;

    const start = performance.now();

    // Remove old components from this file
    const newComponents = { ...currentManifest.components };
    for (const [name, entry] of Object.entries(newComponents)) {
      if (entry.file === filePath) {
        delete newComponents[name];
      }
    }

    // Recompile if source is non-empty
    if (sourceText.trim()) {
      const entries = compileFile(filePath, sourceText);
      for (const { name, entry } of entries) {
        newComponents[name] = entry;
      }
    }

    // Atomic swap
    currentManifest = { components: newComponents };
    updateDiagnostics(currentManifest, false);
    rebuildCount++;
    lastRebuildMs = Math.round(performance.now() - start);
    lastRebuildAt = new Date().toISOString();
  }

  return {
    build() {
      fullBuild();
    },

    onFileChange(filePath: string, sourceText: string) {
      if (!filePath.endsWith('.tsx')) return;
      incrementalUpdate(filePath, sourceText);
    },

    getManifest() {
      return currentManifest;
    },

    getSnapshot(): AotManifestSnapshot {
      return {
        manifest: currentManifest,
        rebuildCount,
        lastRebuildMs,
        lastRebuildAt,
      };
    },

    getDiagnostics() {
      return diagnostics;
    },
  };
}
