import { describe, expect, it } from '@vertz/test';
import { d } from '../d';
import { generateSchemaCode } from '../migration/codegen';
import { generateMigrationSql } from '../migration/sql-generator';
import { createSnapshot } from '../migration/snapshot';
import { validateIndexes } from '../migration/validate-indexes';

describe('Feature: pgvector support', () => {
  describe('Given a schema with vector column and HNSW index', () => {
    const documents = d.table(
      'documents',
      {
        id: d.uuid().primary(),
        content: d.text(),
        embedding: d.vector(1536),
      },
      {
        indexes: [
          d.index('embedding', {
            type: 'hnsw',
            opclass: 'vector_cosine_ops',
            m: 16,
            efConstruction: 64,
          }),
        ],
      },
    );

    describe('When inferring TypeScript types', () => {
      it('Then embedding is number[]', () => {
        const _check: (typeof documents)['$infer'] = {
          id: 'uuid',
          content: 'text',
          embedding: [0.1, 0.2, 0.3],
        };
        expect(_check.embedding).toEqual([0.1, 0.2, 0.3]);
      });

      it('Then string is not assignable to vector', () => {
        // @ts-expect-error — vector is number[], not string
        const _bad: (typeof documents)['$infer']['embedding'] = 'not a vector';
        void _bad;
      });
    });

    describe('When creating a snapshot', () => {
      it('Then captures vector type and dimensions', () => {
        const snapshot = createSnapshot([documents]);
        const col = snapshot.tables['documents'].columns['embedding'];
        expect(col.type).toBe('vector');
        expect(col.dimensions).toBe(1536);
      });

      it('Then captures HNSW index options', () => {
        const snapshot = createSnapshot([documents]);
        const idx = snapshot.tables['documents'].indexes[0];
        expect(idx.type).toBe('hnsw');
        expect(idx.opclass).toBe('vector_cosine_ops');
        expect(idx.m).toBe(16);
        expect(idx.efConstruction).toBe(64);
      });
    });

    describe('When generating migration SQL', () => {
      it('Then produces correct DDL with vector column and HNSW index', () => {
        const snapshot = createSnapshot([documents]);
        const sql = generateMigrationSql([{ type: 'table_added', table: 'documents' }], {
          tables: snapshot.tables,
        });
        expect(sql).toContain('"embedding" vector(1536) NOT NULL');
        expect(sql).toContain('USING hnsw ("embedding" vector_cosine_ops)');
        expect(sql).toContain('WITH (m = 16, ef_construction = 64)');
      });
    });

    describe('When generating schema code', () => {
      it('Then round-trips to correct d.vector() and d.index() calls', () => {
        const snapshot = createSnapshot([documents]);
        const [file] = generateSchemaCode(snapshot, { dialect: 'postgres', mode: 'single-file' });
        expect(file.content).toContain('d.vector(1536)');
        expect(file.content).toContain("type: 'hnsw'");
        expect(file.content).toContain("opclass: 'vector_cosine_ops'");
        expect(file.content).toContain('m: 16');
        expect(file.content).toContain('efConstruction: 64');
      });
    });

    describe('When validating for SQLite', () => {
      it('Then warns about hnsw index type', () => {
        const snapshot = createSnapshot([documents]);
        const warnings = validateIndexes(snapshot.tables, 'sqlite');
        expect(warnings.some((w) => w.includes('hnsw'))).toBe(true);
      });
    });
  });

  describe('Given an IVFFlat index', () => {
    it('Then SQLite validation warns about ivfflat', () => {
      const table = d.table(
        'docs',
        {
          id: d.uuid().primary(),
          embedding: d.vector(384),
        },
        {
          indexes: [
            d.index('embedding', { type: 'ivfflat', opclass: 'vector_l2_ops', lists: 100 }),
          ],
        },
      );
      const snapshot = createSnapshot([table]);
      const warnings = validateIndexes(snapshot.tables, 'sqlite');
      expect(warnings.some((w) => w.includes('ivfflat'))).toBe(true);
    });

    it('Then SQL generation produces correct IVFFlat DDL', () => {
      const table = d.table(
        'docs',
        {
          id: d.uuid().primary(),
          embedding: d.vector(384),
        },
        {
          indexes: [
            d.index('embedding', { type: 'ivfflat', opclass: 'vector_l2_ops', lists: 100 }),
          ],
        },
      );
      const snapshot = createSnapshot([table]);
      const sql = generateMigrationSql([{ type: 'table_added', table: 'docs' }], {
        tables: snapshot.tables,
      });
      expect(sql).toContain('USING ivfflat ("embedding" vector_l2_ops)');
      expect(sql).toContain('WITH (lists = 100)');
    });
  });

  describe('Given invalid index option combinations', () => {
    it('Then throws when HNSW params used with ivfflat', () => {
      expect(() =>
        d.index('embedding', { type: 'ivfflat', opclass: 'vector_cosine_ops', m: 16 }),
      ).toThrow();
    });

    it('Then throws when IVFFlat params used with hnsw', () => {
      expect(() =>
        d.index('embedding', { type: 'hnsw', opclass: 'vector_cosine_ops', lists: 100 }),
      ).toThrow();
    });

    it('Then throws when vector params used without vector type', () => {
      expect(() => d.index('title', { m: 16 })).toThrow();
    });
  });
});
