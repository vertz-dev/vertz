import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SchemaSnapshot } from './snapshot';
import type { SnapshotStorage } from './storage';

/**
 * Node.js filesystem implementation of SnapshotStorage.
 * Uses node:fs/promises for file I/O and node:path for directory creation.
 */
export class NodeSnapshotStorage implements SnapshotStorage {
  async load(path: string): Promise<SchemaSnapshot | null> {
    try {
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content) as SchemaSnapshot;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async save(path: string, snapshot: SchemaSnapshot): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    const content = JSON.stringify(snapshot, null, 2);
    await writeFile(path, `${content}\n`, 'utf-8');
  }
}
