/**
 * CSS HMR Integration for Vite Dev Mode.
 *
 * When a css() call changes, only the affected CSS is hot-replaced.
 * No full page reload needed for style changes. This module provides
 * the invalidation logic that a Vite plugin would call — it does not
 * need to BE a Vite plugin itself.
 *
 * Usage from a Vite plugin:
 *   1. On file load: handler.register(filePath, extractedCSS)
 *   2. On file change: handler.update(filePath, newCSS) -> { hasChanged, css, affectedFiles }
 *   3. If hasChanged: inject the new CSS via Vite's HMR API
 */

/** Result of a CSS HMR update check. */
export interface CSSHMRUpdateResult {
  /** Whether the CSS actually changed. */
  hasChanged: boolean;
  /** The new CSS content (only meaningful if hasChanged is true). */
  css: string;
  /** List of file paths whose CSS was affected. */
  affectedFiles: string[];
}

/**
 * Tracks CSS state per file and provides change detection for HMR.
 */
export class CSSHMRHandler {
  /** Map of file path to its last known CSS content. */
  private cssCache = new Map<string, string>();

  /**
   * Register a file's extracted CSS. Called on initial load.
   * @param filePath - The source file path.
   * @param css - The extracted CSS content.
   */
  register(filePath: string, css: string): void {
    this.cssCache.set(filePath, css);
  }

  /**
   * Check if a file's CSS has changed and update the cache.
   * @param filePath - The source file path.
   * @param newCSS - The newly extracted CSS content.
   * @returns Update result with change status and affected files.
   */
  update(filePath: string, newCSS: string): CSSHMRUpdateResult {
    const previousCSS = this.cssCache.get(filePath);

    if (previousCSS === newCSS) {
      return {
        hasChanged: false,
        css: newCSS,
        affectedFiles: [],
      };
    }

    this.cssCache.set(filePath, newCSS);

    return {
      hasChanged: true,
      css: newCSS,
      affectedFiles: [filePath],
    };
  }

  /**
   * Remove a file from HMR tracking.
   * @param filePath - The source file path to untrack.
   */
  remove(filePath: string): void {
    this.cssCache.delete(filePath);
  }

  /**
   * Get a full CSS snapshot of all tracked files.
   * Useful for providing the complete CSS state to Vite's HMR API.
   * @returns Combined CSS from all tracked files.
   */
  getSnapshot(): string {
    const parts: string[] = [];
    for (const [_filePath, css] of this.cssCache) {
      if (css.length > 0) {
        parts.push(css);
      }
    }
    return parts.join('\n');
  }

  /**
   * Get the number of tracked files.
   */
  get size(): number {
    return this.cssCache.size;
  }

  /**
   * Clear all tracked CSS state.
   */
  clear(): void {
    this.cssCache.clear();
  }
}
