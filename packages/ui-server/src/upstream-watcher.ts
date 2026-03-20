/**
 * Upstream package watcher — detects when workspace-linked package dist
 * directories change and triggers a dev server restart.
 */

import type { FSWatcher } from 'node:fs';
import { existsSync, lstatSync, readdirSync, realpathSync, watch } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve workspace-linked packages to their real dist paths.
 *
 * Scans `node_modules/@vertz/` (or specific package names) for symlinks.
 * Only includes packages that are symlinked (workspace-linked) and have
 * a `dist/` directory.
 *
 * `filter: true` auto-detects all `@vertz/*` packages.
 * `filter: string[]` only checks the named packages.
 */
export function resolveWorkspacePackages(
  projectRoot: string,
  filter: true | string[],
): Array<{ name: string; distPath: string }> {
  const results: Array<{ name: string; distPath: string }> = [];

  const packageNames: Array<{ scope: string; name: string }> =
    filter === true ? discoverVertzPackages(projectRoot) : parsePackageNames(filter);

  for (const { scope, name } of packageNames) {
    const nmPath = join(projectRoot, 'node_modules', scope, name);
    if (!existsSync(nmPath)) continue;

    // Check if it's a symlink (workspace-linked)
    const stat = lstatSync(nmPath);
    if (!stat.isSymbolicLink()) continue;

    // Resolve the real path and check for dist/
    const realPath = realpathSync(nmPath);
    const distPath = join(realPath, 'dist');
    if (!existsSync(distPath)) continue;

    const fullName = scope ? `${scope}/${name}` : name;
    results.push({ name: fullName, distPath });
  }

  return results;
}

/** Discover all packages under `node_modules/@vertz/`. */
function discoverVertzPackages(projectRoot: string): Array<{ scope: string; name: string }> {
  const scopeDir = join(projectRoot, 'node_modules', '@vertz');
  if (!existsSync(scopeDir)) return [];

  return readdirSync(scopeDir)
    .filter((entry) => !entry.startsWith('.'))
    .map((entry) => ({ scope: '@vertz', name: entry }));
}

/** Parse `@scope/name` strings into `{ scope, name }` tuples. */
function parsePackageNames(names: string[]): Array<{ scope: string; name: string }> {
  return names.map((pkg) => {
    const match = pkg.match(/^(@[^/]+)\/(.+)$/);
    if (match?.[1] && match[2]) return { scope: match[1], name: match[2] };
    return { scope: '', name: pkg };
  });
}

export interface UpstreamWatcherOptions {
  /** Project root directory */
  projectRoot: string;
  /** Package names to watch, or true to auto-detect @vertz/* */
  watchDeps: true | string[];
  /** Called when a dist change is detected */
  onDistChanged: (packageName: string) => void;
  /** Debounce interval in ms. @default 1000 */
  debounceMs?: number;
  /** Keep the watcher alive in the event loop. @default false */
  persistent?: boolean;
}

export interface UpstreamWatcher {
  /** List of packages being watched */
  readonly packages: ReadonlyArray<{ name: string; distPath: string }>;
  /** Stop all watchers */
  close(): void;
}

/**
 * Create file watchers for upstream workspace-linked package dist directories.
 *
 * When a file changes in a watched dist directory, `onDistChanged` is called
 * after the debounce period with the package name that changed.
 */
export function createUpstreamWatcher(options: UpstreamWatcherOptions): UpstreamWatcher {
  const { projectRoot, watchDeps, onDistChanged, debounceMs = 1000, persistent = false } = options;

  const packages = resolveWorkspacePackages(projectRoot, watchDeps);
  const watchers: FSWatcher[] = [];
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;

  for (const pkg of packages) {
    try {
      const watcher = watch(pkg.distPath, { recursive: true, persistent }, () => {
        if (closed) return;

        // Debounce per-package — builds write many files over ~1s
        const existing = debounceTimers.get(pkg.name);
        if (existing) clearTimeout(existing);

        debounceTimers.set(
          pkg.name,
          setTimeout(() => {
            debounceTimers.delete(pkg.name);
            if (!closed) {
              onDistChanged(pkg.name);
            }
          }, debounceMs),
        );
      });

      watcher.on('error', () => {
        // dist/ may be temporarily deleted during clean rebuilds — don't crash
      });

      watchers.push(watcher);
    } catch {
      // Failed to watch this dist dir — skip silently
    }
  }

  return {
    packages,
    close() {
      closed = true;
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // Already closed
        }
      }
      watchers.length = 0;
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
    },
  };
}
