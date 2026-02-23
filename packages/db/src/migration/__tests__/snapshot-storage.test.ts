import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadSnapshot, saveSnapshot } from '../snapshot-storage';
import { writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('snapshot-storage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snapshot-test-'));
  });

  afterEach(async () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadSnapshot', () => {
    it('returns null when file does not exist', async () => {
      const result = await loadSnapshot(join(tmpDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('throws error for corrupted JSON', async () => {
      const corruptedPath = join(tmpDir, 'corrupted.json');
      await writeFile(corruptedPath, '{ invalid json }');

      await expect(loadSnapshot(corruptedPath)).rejects.toThrow();
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
      const loaded = await loadSnapshot(snapshotPath);

      expect(loaded).toEqual(snapshot);
    });
  });

  describe('saveSnapshot', () => {
    it('creates parent directory if it does not exist', async () => {
      const nestedPath = join(tmpDir, 'nested', 'deep', 'snapshot.json');
      const snapshot = { version: 1, tables: {}, enums: {} };

      await saveSnapshot(nestedPath, snapshot);

      // Verify file was created
      const loaded = await loadSnapshot(nestedPath);
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

      await saveSnapshot(snapshotPath, snapshot);
      const loaded = await loadSnapshot(snapshotPath);

      expect(loaded).toEqual(snapshot);
    });

    it('overwrites existing file', async () => {
      const snapshotPath = join(tmpDir, 'snapshot.json');

      await saveSnapshot(snapshotPath, { version: 1, tables: { users: { columns: { id: { type: 'uuid', nullable: false, primary: true, unique: false } }, indexes: [], foreignKeys: [], _metadata: {} } }, enums: {} });
      await saveSnapshot(snapshotPath, { version: 1, tables: { posts: { columns: { id: { type: 'uuid', nullable: false, primary: true, unique: false } }, indexes: [], foreignKeys: [], _metadata: {} } }, enums: {} });

      const loaded = await loadSnapshot(snapshotPath);
      expect(loaded?.tables).toHaveProperty('posts');
      expect(loaded?.tables).not.toHaveProperty('users');
    });
  });
});
