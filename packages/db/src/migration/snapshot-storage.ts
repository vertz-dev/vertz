import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SchemaSnapshot } from './snapshot';

/**
 * Load a schema snapshot from a JSON file.
 * Returns null if the file doesn't exist (first run).
 */
export async function loadSnapshot(path: string): Promise<SchemaSnapshot | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as SchemaSnapshot;
  } catch (err) {
    // File doesn't exist or is invalid — treat as first run
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Save a schema snapshot to a JSON file.
 * Creates parent directories if they don't exist.
 */
export async function saveSnapshot(
  path: string,
  snapshot: SchemaSnapshot,
): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify(snapshot, null, 2);
  await writeFile(path, content, 'utf-8');
}
