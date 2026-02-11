import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../client/database';
import { d } from '../../d';
import type { TableEntry } from '../../schema/inference';

/**
 * Aggregation query integration tests — DB-012 acceptance criteria.
 *
 * Tests count, aggregate, and groupBy methods against PGlite.
 */
describe('Aggregation queries (DB-012)', () => {
  let pg: PGlite;

  const productsTable = d.table('products', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
    category: d.text(),
    price: d.integer(),
    quantity: d.integer(),
    active: d.boolean().default(true),
  });

  const tables = {
    products: { table: productsTable, relations: {} },
  } satisfies Record<string, TableEntry>;

  type Db = ReturnType<typeof createDb<typeof tables>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        active BOOLEAN DEFAULT TRUE
      );
    `);

    db = createDb({
      url: 'pglite://memory',
      tables,
      _queryFn: async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      },
    });
  });

  afterAll(async () => {
    await pg.close();
  });

  beforeEach(async () => {
    await pg.exec('DELETE FROM products');
    // Seed test data
    await pg.exec(`
      INSERT INTO products (name, category, price, quantity, active) VALUES
        ('Widget A', 'widgets', 100, 10, true),
        ('Widget B', 'widgets', 150, 5, true),
        ('Widget C', 'widgets', 200, 3, false),
        ('Gadget A', 'gadgets', 300, 8, true),
        ('Gadget B', 'gadgets', 250, 12, true);
    `);
  });

  // -------------------------------------------------------------------------
  // count
  // -------------------------------------------------------------------------

  describe('count', () => {
    it('returns correct count as number', async () => {
      const result = await db.count('products');
      expect(result).toBe(5);
    });

    it('respects where filter', async () => {
      const result = await db.count('products', { where: { category: 'widgets' } });
      expect(result).toBe(3);
    });

    it('returns 0 when no rows match', async () => {
      const result = await db.count('products', { where: { category: 'nonexistent' } });
      expect(result).toBe(0);
    });

    it('counts active products correctly', async () => {
      const result = await db.count('products', { where: { active: true } });
      expect(result).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // aggregate
  // -------------------------------------------------------------------------

  describe('aggregate', () => {
    it('computes _avg correctly', async () => {
      const result = await db.aggregate('products', {
        _avg: { price: true },
      });
      // (100 + 150 + 200 + 300 + 250) / 5 = 200
      expect((result._avg as Record<string, unknown>).price).toBe(200);
    });

    it('computes _sum correctly', async () => {
      const result = await db.aggregate('products', {
        _sum: { quantity: true },
      });
      // 10 + 5 + 3 + 8 + 12 = 38
      expect((result._sum as Record<string, unknown>).quantity).toBe(38);
    });

    it('computes _min and _max correctly', async () => {
      const result = await db.aggregate('products', {
        _min: { price: true },
        _max: { price: true },
      });
      expect((result._min as Record<string, unknown>).price).toBe(100);
      expect((result._max as Record<string, unknown>).price).toBe(300);
    });

    it('computes _count correctly', async () => {
      const result = await db.aggregate('products', {
        _count: true,
      });
      expect(result._count).toBe(5);
    });

    it('combines multiple aggregations in one call', async () => {
      const result = await db.aggregate('products', {
        _avg: { price: true },
        _sum: { quantity: true },
        _min: { price: true },
        _max: { price: true },
        _count: true,
      });
      expect(result._count).toBe(5);
      expect((result._avg as Record<string, unknown>).price).toBe(200);
      expect((result._sum as Record<string, unknown>).quantity).toBe(38);
      expect((result._min as Record<string, unknown>).price).toBe(100);
      expect((result._max as Record<string, unknown>).price).toBe(300);
    });

    it('respects where filter on aggregate', async () => {
      const result = await db.aggregate('products', {
        where: { category: 'widgets' },
        _avg: { price: true },
        _count: true,
      });
      expect(result._count).toBe(3);
      // (100 + 150 + 200) / 3 = 150
      expect((result._avg as Record<string, unknown>).price).toBe(150);
    });

    it('returns empty object when no aggregation fields requested', async () => {
      const result = await db.aggregate('products', {});
      expect(result).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // groupBy
  // -------------------------------------------------------------------------

  describe('groupBy', () => {
    it('groups by specified columns', async () => {
      const result = await db.groupBy('products', {
        by: ['category'],
        _count: true,
      });
      expect(result).toHaveLength(2);

      const widgets = result.find((r) => r.category === 'widgets');
      const gadgets = result.find((r) => r.category === 'gadgets');

      expect(widgets).toBeDefined();
      expect(widgets?._count).toBe(3);
      expect(gadgets).toBeDefined();
      expect(gadgets?._count).toBe(2);
    });

    it('includes aggregation results per group', async () => {
      const result = await db.groupBy('products', {
        by: ['category'],
        _avg: { price: true },
        _sum: { quantity: true },
      });

      const widgets = result.find((r) => r.category === 'widgets');
      expect(widgets).toBeDefined();
      // avg(100, 150, 200) = 150
      expect((widgets?._avg as Record<string, unknown>).price).toBe(150);
      // sum(10, 5, 3) = 18
      expect((widgets?._sum as Record<string, unknown>).quantity).toBe(18);
    });

    it('respects orderBy on aggregation results', async () => {
      const result = await db.groupBy('products', {
        by: ['category'],
        _count: true,
        orderBy: { _count: 'desc' },
      });

      expect(result).toHaveLength(2);
      // widgets (3) should come before gadgets (2) with DESC order
      expect(result[0]?.category).toBe('widgets');
      expect(result[0]?._count).toBe(3);
      expect(result[1]?.category).toBe('gadgets');
      expect(result[1]?._count).toBe(2);
    });

    it('groups by multiple columns', async () => {
      const result = await db.groupBy('products', {
        by: ['category', 'active'],
        _count: true,
        orderBy: { _count: 'desc' },
      });

      // 3 groups: widgets+true(2), widgets+false(1), gadgets+true(2)
      expect(result).toHaveLength(3);
    });

    it('respects where filter on groupBy', async () => {
      const result = await db.groupBy('products', {
        by: ['category'],
        where: { active: true },
        _count: true,
      });

      const widgets = result.find((r) => r.category === 'widgets');
      const gadgets = result.find((r) => r.category === 'gadgets');

      // Only active widgets: Widget A, Widget B = 2
      expect(widgets?._count).toBe(2);
      // Both gadgets are active
      expect(gadgets?._count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // B1: SQL injection prevention in groupBy ORDER BY
  // -------------------------------------------------------------------------

  describe('groupBy orderBy safety (B1)', () => {
    it('rejects underscore-prefixed orderBy columns that are not valid aggregation aliases', async () => {
      await expect(
        db.groupBy('products', {
          by: ['category'],
          _count: true,
          orderBy: { '_; DROP TABLE products; --': 'asc' } as Record<string, 'asc' | 'desc'>,
        }),
      ).rejects.toThrow(/Invalid orderBy/);
    });

    it('rejects orderBy with an invalid direction value', async () => {
      await expect(
        db.groupBy('products', {
          by: ['category'],
          _count: true,
          orderBy: { _count: 'INVALID; DROP TABLE products;' as 'asc' },
        }),
      ).rejects.toThrow(/Invalid orderBy direction/);
    });

    it('allows valid aggregation alias in orderBy (e.g., _avg_price)', async () => {
      const result = await db.groupBy('products', {
        by: ['category'],
        _avg: { price: true },
        orderBy: { _avg_price: 'desc' } as Record<string, 'asc' | 'desc'>,
      });

      expect(result).toHaveLength(2);
      // gadgets avg = (300+250)/2 = 275, widgets avg = (100+150+200)/3 = 150
      expect(result[0]?.category).toBe('gadgets');
      expect(result[1]?.category).toBe('widgets');
    });

    it('quotes valid aggregation aliases in ORDER BY', async () => {
      // This should work without SQL injection — just verifying the query succeeds
      const result = await db.groupBy('products', {
        by: ['category'],
        _sum: { quantity: true },
        _count: true,
        orderBy: { _sum_quantity: 'asc' } as Record<string, 'asc' | 'desc'>,
      });

      expect(result).toHaveLength(2);
    });
  });
});
