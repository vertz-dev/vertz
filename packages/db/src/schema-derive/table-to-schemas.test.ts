import { describe, expect, it } from 'bun:test';
import { d } from '../d';
import { tableToSchemas } from './table-to-schemas';

// ---------------------------------------------------------------------------
// Test tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  passwordHash: d.varchar(255).hidden(),
  role: d.enum('user_role', ['admin', 'member']).default('member'),
  createdAt: d.timestamp().default('now'),
});

const posts = d.table('posts', {
  id: d.serial(),
  title: d.varchar(200),
  body: d.text().nullable(),
  views: d.integer(),
  rating: d.real(),
  published: d.boolean(),
  tags: d.textArray(),
  scores: d.integerArray(),
  metadata: d.jsonb(),
  createdAt: d.timestamp().default('now'),
});

const products = d.table('products', {
  id: d.uuid().primary(),
  name: d.text(),
  price: d.decimal(10, 2),
  weight: d.doublePrecision(),
  count: d.bigint(),
  releaseDate: d.date(),
  availableAt: d.time(),
  secret: d.text().sensitive(),
});

// ---------------------------------------------------------------------------
// tableToSchemas — return shape
// ---------------------------------------------------------------------------

describe('tableToSchemas', () => {
  it('returns an object with createBody, updateBody, and responseSchema', () => {
    const schemas = tableToSchemas(users);
    expect(schemas).toHaveProperty('createBody');
    expect(schemas).toHaveProperty('updateBody');
    expect(schemas).toHaveProperty('responseSchema');
  });

  // -------------------------------------------------------------------------
  // createBody
  // -------------------------------------------------------------------------

  describe('createBody', () => {
    it('excludes primary key columns', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.createBody.shape;
      expect(shape).not.toHaveProperty('id');
    });

    it('excludes columns with defaults', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.createBody.shape;
      expect(shape).not.toHaveProperty('role');
      expect(shape).not.toHaveProperty('createdAt');
    });

    it('includes required columns without defaults', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('name');
      expect(shape).toHaveProperty('email');
      expect(shape).toHaveProperty('passwordHash');
    });

    it('excludes serial columns (they have defaults)', () => {
      const schemas = tableToSchemas(posts);
      const shape = schemas.createBody.shape;
      expect(shape).not.toHaveProperty('id');
    });

    it('validates a correct create payload', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.createBody.safeParse({
        name: 'Alice',
        email: 'alice@example.com',
        passwordHash: 'hashed',
      });
      expect(result.ok).toBe(true);
    });

    it('rejects a payload missing required fields', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.createBody.safeParse({
        name: 'Alice',
        // missing email and passwordHash
      });
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // updateBody
  // -------------------------------------------------------------------------

  describe('updateBody', () => {
    it('excludes primary key columns', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.updateBody.shape;
      expect(shape).not.toHaveProperty('id');
    });

    it('makes all fields optional', () => {
      const schemas = tableToSchemas(users);
      // An empty object should be valid for update
      const result = schemas.updateBody.safeParse({});
      expect(result.ok).toBe(true);
    });

    it('includes columns that have defaults (they can be updated)', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.updateBody.shape;
      expect(shape).toHaveProperty('role');
      expect(shape).toHaveProperty('createdAt');
    });

    it('validates partial updates', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.updateBody.safeParse({
        name: 'Bob',
      });
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // responseSchema
  // -------------------------------------------------------------------------

  describe('responseSchema', () => {
    it('excludes hidden columns', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.responseSchema.shape;
      expect(shape).not.toHaveProperty('passwordHash');
    });

    it('excludes sensitive columns', () => {
      const schemas = tableToSchemas(products);
      const shape = schemas.responseSchema.shape;
      expect(shape).not.toHaveProperty('secret');
    });

    it('includes primary key columns', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.responseSchema.shape;
      expect(shape).toHaveProperty('id');
    });

    it('includes columns with defaults', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.responseSchema.shape;
      expect(shape).toHaveProperty('role');
      expect(shape).toHaveProperty('createdAt');
    });

    it('validates a response object', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.responseSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'admin',
        createdAt: new Date(),
      });
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Column type mapping
  // -------------------------------------------------------------------------

  describe('column type mapping', () => {
    it('maps uuid to s.uuid()', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.responseSchema.safeParse({
        id: 'not-a-uuid',
        name: 'A',
        email: 'a@b.com',
        role: 'member',
        createdAt: new Date(),
      });
      expect(result.ok).toBe(false);
    });

    it('maps varchar(n) with max length validation', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: 'x'.repeat(201),
        body: null,
        views: 1,
        rating: 1.0,
        published: true,
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(false);
    });

    it('maps email to s.email()', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.createBody.safeParse({
        name: 'A',
        email: 'not-an-email',
        passwordHash: 'hash',
      });
      expect(result.ok).toBe(false);
    });

    it('maps boolean correctly', () => {
      const schemas = tableToSchemas(posts);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('published');

      const result = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1,
        rating: 1.0,
        published: 'not-a-boolean',
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(false);
    });

    it('maps integer to s.number().int()', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1.5,
        rating: 1.0,
        published: true,
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(false);
    });

    it('maps real/doublePrecision to s.number()', () => {
      const schemas = tableToSchemas(posts);
      const validResult = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1,
        rating: 3.14,
        published: true,
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(validResult.ok).toBe(true);
    });

    it('maps bigint to s.bigint()', () => {
      const schemas = tableToSchemas(products);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('count');
    });

    it('maps decimal to s.string()', () => {
      const schemas = tableToSchemas(products);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('price');
    });

    it('maps enum to s.enum(values)', () => {
      const schemas = tableToSchemas(users);
      const result = schemas.updateBody.safeParse({
        role: 'invalid-role',
      });
      expect(result.ok).toBe(false);

      const validResult = schemas.updateBody.safeParse({
        role: 'admin',
      });
      expect(validResult.ok).toBe(true);
    });

    it('maps textArray to s.array(s.string())', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1,
        rating: 1.0,
        published: true,
        tags: ['a', 'b'],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(true);
    });

    it('maps integerArray to s.array(s.number().int())', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1,
        rating: 1.0,
        published: true,
        tags: [],
        scores: [1, 2, 3],
        metadata: {},
      });
      expect(result.ok).toBe(true);
    });

    it('maps jsonb to s.unknown()', () => {
      const schemas = tableToSchemas(posts);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('metadata');
    });

    it('maps timestamp to s.date()', () => {
      const schemas = tableToSchemas(users);
      const shape = schemas.responseSchema.shape;
      expect(shape).toHaveProperty('createdAt');
    });

    it('maps date to s.string()', () => {
      const schemas = tableToSchemas(products);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('releaseDate');
    });

    it('maps time to s.string()', () => {
      const schemas = tableToSchemas(products);
      const shape = schemas.createBody.shape;
      expect(shape).toHaveProperty('availableAt');
    });
  });

  // -------------------------------------------------------------------------
  // Nullable columns
  // -------------------------------------------------------------------------

  describe('nullable columns', () => {
    it('allows null for nullable columns', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: 'Test',
        body: null,
        views: 1,
        rating: 1.0,
        published: true,
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(true);
    });

    it('rejects null for non-nullable columns', () => {
      const schemas = tableToSchemas(posts);
      const result = schemas.createBody.safeParse({
        title: null,
        body: null,
        views: 1,
        rating: 1.0,
        published: true,
        tags: [],
        scores: [],
        metadata: {},
      });
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error on unknown column type
  // -------------------------------------------------------------------------

  describe('unknown column type', () => {
    it('throws on unrecognized sqlType', () => {
      const weirdTable = d.table('weird', {
        // @ts-expect-error — deliberately using internal createColumn with a fake type
        col: {
          _meta: {
            sqlType: 'geometry',
            primary: false,
            hasDefault: false,
            hidden: false,
            sensitive: false,
            nullable: false,
          },
        },
      });
      expect(() => tableToSchemas(weirdTable)).toThrow(/unknown.*column.*type.*geometry/i);
    });
  });
});
