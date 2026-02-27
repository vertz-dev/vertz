import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SchemaSnapshot } from '../snapshot';
import { NodeSnapshotStorage } from '../snapshot-storage';
import type { SnapshotStorage } from '../storage';

describe('NodeSnapshotStorage', () => {
  let tmpDir: string;
  let storage: NodeSnapshotStorage;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snapshot-test-'));
    storage = new NodeSnapshotStorage();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('returns null when file does not exist', async () => {
      const result = await storage.load(join(tmpDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('throws error for corrupted JSON', async () => {
      const corruptedPath = join(tmpDir, 'corrupted.json');
      await writeFile(corruptedPath, '{ invalid json }');

      await expect(storage.load(corruptedPath)).rejects.toThrow();
    });

    it('loads valid snapshot from file', async () => {
      const snapshotPath = join(tmpDir, 'snapshot.json');
      const snapshot = {
        version: 1,
        tables: {
          users: {
            columns: {
              id: { type: 'uuid', nullable: false, primary: true, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      };

      await writeFile(snapshotPath, JSON.stringify(snapshot));
      const loaded = await storage.load(snapshotPath);

      expect(loaded).toEqual(snapshot);
    });
  });

  describe('save', () => {
    it('creates parent directory if it does not exist', async () => {
      const nestedPath = join(tmpDir, 'nested', 'deep', 'snapshot.json');
      const snapshot = { version: 1, tables: {}, enums: {} };

      await storage.save(nestedPath, snapshot as SchemaSnapshot);

      const loaded = await storage.load(nestedPath);
      expect(loaded).toEqual(snapshot);
    });

    it('saves and loads roundtrip works', async () => {
      const snapshotPath = join(tmpDir, 'snapshot.json');
      const snapshot = {
        version: 1,
        tables: {
          posts: {
            columns: {
              id: { type: 'uuid', nullable: false, primary: true, unique: false },
              title: { type: 'text', nullable: false, primary: false, unique: false },
              content: { type: 'text', nullable: true, primary: false, unique: false },
            },
            indexes: [{ columns: ['title'] }],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: { user_role: ['admin', 'editor', 'viewer'] },
      };

      await storage.save(snapshotPath, snapshot as SchemaSnapshot);
      const loaded = await storage.load(snapshotPath);

      expect(loaded).toEqual(snapshot);
    });

    it('overwrites existing file', async () => {
      const snapshotPath = join(tmpDir, 'snapshot.json');

      await storage.save(snapshotPath, {
        version: 1,
        tables: {
          users: {
            columns: { id: { type: 'uuid', nullable: false, primary: true, unique: false } },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      } as SchemaSnapshot);
      await storage.save(snapshotPath, {
        version: 1,
        tables: {
          posts: {
            columns: { id: { type: 'uuid', nullable: false, primary: true, unique: false } },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      } as SchemaSnapshot);

      const loaded = await storage.load(snapshotPath);
      expect(loaded?.tables).toHaveProperty('posts');
      expect(loaded?.tables).not.toHaveProperty('users');
    });
  });
});

describe('SnapshotStorage contract', () => {
  it('works with an in-memory implementation', async () => {
    const store = new Map<string, SchemaSnapshot>();
    const inMemory: SnapshotStorage = {
      async load(key) {
        return store.get(key) ?? null;
      },
      async save(key, snapshot) {
        store.set(key, snapshot);
      },
    };

    const snapshot = { version: 1, tables: {}, enums: {} } as SchemaSnapshot;

    expect(await inMemory.load('test')).toBeNull();
    await inMemory.save('test', snapshot);
    expect(await inMemory.load('test')).toEqual(snapshot);
  });
});
