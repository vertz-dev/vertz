import type { SchemaSnapshot } from './snapshot';

/**
 * Abstraction over snapshot persistence.
 * Decouples the migration system from Node.js filesystem APIs.
 */
export interface SnapshotStorage {
  load(key: string): Promise<SchemaSnapshot | null>;
  save(key: string, snapshot: SchemaSnapshot): Promise<void>;
}
