import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** A discovered MDX page. */
export interface DiscoveredPage {
  relativePath: string;
  absolutePath: string;
}

/**
 * Recursively discover all `.mdx` files in the given directory.
 * Returns an empty array if the directory doesn't exist.
 */
export async function discoverPages(pagesDir: string): Promise<DiscoveredPage[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(pagesDir, { recursive: true, withFileTypes: true }) as Dirent[];
  } catch {
    return [];
  }

  const pages: DiscoveredPage[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue;
    const absolutePath = join(entry.parentPath, entry.name);
    const relativePath = relative(pagesDir, absolutePath);
    pages.push({ relativePath, absolutePath });
  }

  return pages;
}
