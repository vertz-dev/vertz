/**
 * Build Freshness Detection
 *
 * Determines whether a production build is up-to-date by comparing
 * source file mtimes against build output markers.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppType } from '../dev-server/app-detector';

export interface FreshnessCheckResult {
  fresh: boolean;
  reason: string;
}

export interface FreshnessOptions {
  /** Override for file mtime resolution. Used for testing. */
  getFileMtimeMs?: (filePath: string) => number | undefined;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);

/**
 * Check whether the production build is fresh (newer than all source files).
 */
export function isBuildFresh(
  projectRoot: string,
  appType: AppType,
  options?: FreshnessOptions,
): FreshnessCheckResult {
  const getMtime = options?.getFileMtimeMs ?? defaultGetFileMtimeMs;

  const markerMtime = getBuildMarkerMtime(projectRoot, appType, getMtime);
  if (markerMtime === undefined) {
    return { fresh: false, reason: 'dist/ is missing' };
  }

  const maxSourceMtime = getMaxSourceMtime(projectRoot, getMtime);
  if (maxSourceMtime === undefined) {
    // No source files found — can't determine freshness, assume stale
    return { fresh: false, reason: 'no source files found' };
  }

  if (maxSourceMtime > markerMtime) {
    return { fresh: false, reason: 'src/ has changes newer than build' };
  }

  return { fresh: true, reason: 'dist/ is up to date' };
}

type GetMtime = (filePath: string) => number | undefined;

function defaultGetFileMtimeMs(filePath: string): number | undefined {
  if (!existsSync(filePath)) return undefined;
  return statSync(filePath).mtimeMs;
}

/**
 * Get the mtime of the build output marker for the given app type.
 * For full-stack apps, returns the minimum of both markers.
 * Returns undefined if any required marker is missing.
 */
function getBuildMarkerMtime(
  projectRoot: string,
  appType: AppType,
  getMtime: GetMtime,
): number | undefined {
  if (appType === 'api-only') {
    return getMtime(join(projectRoot, '.vertz', 'build', 'index.js'));
  }

  if (appType === 'ui-only') {
    return getUIMarkerMtime(projectRoot, getMtime);
  }

  // full-stack: min(api_marker, ui_marker)
  const apiMtime = getMtime(join(projectRoot, '.vertz', 'build', 'index.js'));
  const uiMtime = getUIMarkerMtime(projectRoot, getMtime);

  if (apiMtime === undefined || uiMtime === undefined) {
    return undefined;
  }

  return Math.min(apiMtime, uiMtime);
}

/**
 * Get the UI build marker mtime. Prefers _shell.html, falls back to index.html.
 */
function getUIMarkerMtime(projectRoot: string, getMtime: GetMtime): number | undefined {
  const shellPath = join(projectRoot, 'dist', 'client', '_shell.html');
  const legacyPath = join(projectRoot, 'dist', 'client', 'index.html');

  return getMtime(shellPath) ?? getMtime(legacyPath);
}

/**
 * Get the maximum mtime across all source files and config files.
 * Scans src/ for files with source extensions, plus vertz.config.ts and package.json.
 */
function getMaxSourceMtime(projectRoot: string, getMtime: GetMtime): number | undefined {
  let maxMtime: number | undefined;

  function updateMax(mtime: number | undefined): void {
    if (mtime !== undefined && (maxMtime === undefined || mtime > maxMtime)) {
      maxMtime = mtime;
    }
  }

  // Scan src/ directory recursively
  const srcDir = join(projectRoot, 'src');
  if (existsSync(srcDir)) {
    walkDir(srcDir, (filePath) => {
      const ext = getExtension(filePath);
      if (!SOURCE_EXTENSIONS.has(ext)) return;
      updateMax(getMtime(filePath));
    });
  }

  // Check config files
  const configFiles = ['vertz.config.ts', 'package.json'];
  for (const configFile of configFiles) {
    const filePath = join(projectRoot, configFile);
    const mtime = getMtime(filePath);
    if (mtime !== undefined && (maxMtime === undefined || mtime > maxMtime)) {
      maxMtime = mtime;
    }
  }

  return maxMtime;
}

/**
 * Recursively walk a directory, calling `callback` for each file.
 */
function walkDir(dir: string, callback: (filePath: string) => void): void {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

/**
 * Get the file extension (lowercase, with dot).
 */
function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.slice(dotIndex).toLowerCase();
}
