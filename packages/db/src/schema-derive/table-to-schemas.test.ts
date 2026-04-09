import { describe, expect, it } from '@vertz/test';
import { d } from '../d';
import { columnToSchema } from './column-mapper';
import { tableToSchemas } from './table-to-schemas';

// ---------------------------------------------------------------------------
// Test tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  passwordHash: d.varchar(255).is('hidden'),
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
  secret: d.text().is('sensitive'),
});

// Table with all column annotation types for apiCreateBody/apiUpdateBody tests
const accounts = d.table('accounts', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  passwordHash: d.varchar(255).is('hidden'),
  apiSecret: d.text().is('sensitive'),
  role: d.enum('account_role', ['admin', 'member']).default('member'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
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

  describe('varchar without length', () => {
    it('maps varchar without length to plain s.string() (no max constraint)', () => {
      const schema = columnToSchema({
        sqlType: 'varchar',
        primary: false,
        unique: false,
        nullable: false,
        hasDefault: false,
        _annotations: {},
        isReadOnly: false,
        isAutoUpdate: false,
        check: null,
      });

      // Should accept any length string (no max constraint)
      const longString = 'x'.repeat(10000);
      const result = schema.safeParse(longString);
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Validation constraints
  // -------------------------------------------------------------------------

  describe('string validation constraints', () => {
    const constrained = d.table('constrained', {
      id: d.uuid().primary(),
      key: d
        .text()
        .min(1)
        .max(5)
        .regex(/^[A-Z0-9]+$/i),
      title: d.text().min(1),
    });

    it('rejects empty string below min length', () => {
      const { createBody } = tableToSchemas(constrained);
      const result = createBody.safeParse({ key: '', title: 'Test' });
      expect(result.ok).toBe(false);
    });

    it('rejects string exceeding max length', () => {
      const { createBody } = tableToSchemas(constrained);
      const result = createBody.safeParse({ key: 'ABCDEF', title: 'Test' });
      expect(result.ok).toBe(false);
    });

    it('rejects string not matching regex', () => {
      const { createBody } = tableToSchemas(constrained);
      const result = createBody.safeParse({ key: 'AB!', title: 'Test' });
      expect(result.ok).toBe(false);
    });

    it('accepts valid string matching all constraints', () => {
      const { createBody } = tableToSchemas(constrained);
      const result = createBody.safeParse({ key: 'ABC', title: 'Test' });
      expect(result.ok).toBe(true);
    });

    it('rejects empty title below min length', () => {
      const { createBody } = tableToSchemas(constrained);
      const result = createBody.safeParse({ key: 'ABC', title: '' });
      expect(result.ok).toBe(false);
    });
  });

  describe('numeric validation constraints', () => {
    const metrics = d.table('metrics', {
      id: d.uuid().primary(),
      score: d.integer().min(0).max(100),
      rating: d.real().min(0).max(5),
    });

    it('rejects value below min', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: -1, rating: 3.0 });
      expect(result.ok).toBe(false);
    });

    it('rejects value above max', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: 101, rating: 3.0 });
      expect(result.ok).toBe(false);
    });

    it('accepts values within range', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: 50, rating: 3.0 });
      expect(result.ok).toBe(true);
    });

    it('rejects rating below min', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: 50, rating: -0.1 });
      expect(result.ok).toBe(false);
    });

    it('rejects rating above max', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: 50, rating: 5.1 });
      expect(result.ok).toBe(false);
    });

    it('accepts boundary values (inclusive min/max)', () => {
      const { createBody } = tableToSchemas(metrics);
      const result = createBody.safeParse({ score: 0, rating: 5 });
      expect(result.ok).toBe(true);
    });
  });

  describe('varchar with explicit constraints', () => {
    it('uses _minLength from explicit .min() on varchar', () => {
      const tbl = d.table('t', {
        id: d.uuid().primary(),
        code: d.varchar(255).min(1),
      });
      const { createBody } = tableToSchemas(tbl);
      expect(createBody.safeParse({ code: '' }).ok).toBe(false);
      expect(createBody.safeParse({ code: 'A' }).ok).toBe(true);
    });

    it('uses _maxLength when explicitly set, overriding varchar length for validation', () => {
      const tbl = d.table('t', {
        id: d.uuid().primary(),
        code: d.varchar(255).max(5),
      });
      const { createBody } = tableToSchemas(tbl);
      expect(createBody.safeParse({ code: 'ABCDEF' }).ok).toBe(false);
      expect(createBody.safeParse({ code: 'ABC' }).ok).toBe(true);
    });
  });

  describe('email with constraints', () => {
    const withEmail = d.table('with_email', {
      id: d.uuid().primary(),
      email: d.email().min(5).max(100),
    });

    it('rejects email shorter than min length', () => {
      const { createBody } = tableToSchemas(withEmail);
      const result = createBody.safeParse({ email: 'a@b' });
      expect(result.ok).toBe(false);
    });

    it('accepts email meeting min length', () => {
      const { createBody } = tableToSchemas(withEmail);
      const result = createBody.safeParse({ email: 'a@b.c' });
      expect(result.ok).toBe(true);
    });

    it('rejects email exceeding max length', () => {
      const { createBody } = tableToSchemas(withEmail);
      const longEmail = `${'a'.repeat(90)}@example.com`;
      const result = createBody.safeParse({ email: longEmail });
      expect(result.ok).toBe(false);
    });
  });

  describe('unknown column type', () => {
    it('throws on unrecognized sqlType', () => {
      const weirdTable = d.table('weird', {
        // @ts-expect-error — deliberately using internal createColumn with a fake type
        col: {
          _meta: {
            sqlType: 'geometry',
            primary: false,
            hasDefault: false,
            _annotations: {},
            nullable: false,
          },
        },
      });
      expect(() => tableToSchemas(weirdTable)).toThrow(/unknown.*column.*type.*geometry/i);
    });
  });
});

// ---------------------------------------------------------------------------
// apiCreateBody / apiUpdateBody — strict input schemas for CRUD endpoints
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Composite primary key table
// ---------------------------------------------------------------------------

const teamMembers = d.table(
  'team_members',
  {
    teamId: d.uuid(),
    userId: d.uuid(),
    role: d.text().default('member'),
  },
  { primaryKey: ['teamId', 'userId'] },
);

const events = d.table(
  'events',
  {
    tenantId: d.uuid(),
    eventDate: d.timestamp().default('now'),
    name: d.text(),
  },
  { primaryKey: ['tenantId', 'eventDate'] },
);

// ---------------------------------------------------------------------------
// tableToSchemas — composite primary keys
// ---------------------------------------------------------------------------

describe('tableToSchemas — composite primary keys', () => {
  describe('createBody', () => {
    it('includes composite PK columns without defaults as required', () => {
      const { createBody } = tableToSchemas(teamMembers);
      expect(createBody.shape).toHaveProperty('teamId');
      expect(createBody.shape).toHaveProperty('userId');
    });

    it('excludes composite PK columns that have defaults', () => {
      const { createBody } = tableToSchemas(events);
      expect(createBody.shape).toHaveProperty('tenantId');
      expect(createBody.shape).not.toHaveProperty('eventDate');
    });
  });

  describe('updateBody', () => {
    it('excludes ALL PK columns (single and composite)', () => {
      const { updateBody } = tableToSchemas(teamMembers);
      expect(updateBody.shape).not.toHaveProperty('teamId');
      expect(updateBody.shape).not.toHaveProperty('userId');
      expect(updateBody.shape).toHaveProperty('role');
    });
  });

  describe('apiCreateBody', () => {
    it('includes composite PK columns as required', () => {
      const { apiCreateBody } = tableToSchemas(teamMembers);
      expect(apiCreateBody.shape).toHaveProperty('teamId');
      expect(apiCreateBody.shape).toHaveProperty('userId');
    });

    it('rejects input missing composite PK columns', () => {
      const { apiCreateBody } = tableToSchemas(teamMembers);
      const result = apiCreateBody.safeParse({ role: 'admin' });
      expect(result.ok).toBe(false);
    });

    it('accepts input with all composite PK columns', () => {
      const { apiCreateBody } = tableToSchemas(teamMembers);
      const result = apiCreateBody.safeParse({
        teamId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      });
      expect(result.ok).toBe(true);
    });

    it('composite PK column with default is optional in create', () => {
      const { apiCreateBody } = tableToSchemas(events);
      expect(apiCreateBody.shape).toHaveProperty('tenantId');
      // eventDate has default — should be optional
      const result = apiCreateBody.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Launch',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('apiUpdateBody', () => {
    it('excludes composite PK columns', () => {
      const { apiUpdateBody } = tableToSchemas(teamMembers);
      expect(apiUpdateBody.shape).not.toHaveProperty('teamId');
      expect(apiUpdateBody.shape).not.toHaveProperty('userId');
      expect(apiUpdateBody.shape).toHaveProperty('role');
    });
  });

  describe('single .primary() unchanged', () => {
    it('still excludes auto-generated PK from createBody', () => {
      const { createBody } = tableToSchemas(users);
      expect(createBody.shape).not.toHaveProperty('id');
    });

    it('still excludes auto-generated PK from apiCreateBody', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).not.toHaveProperty('id');
    });
  });
});

describe('tableToSchemas — API input schemas', () => {
  // -------------------------------------------------------------------------
  // apiCreateBody
  // -------------------------------------------------------------------------

  describe('apiCreateBody', () => {
    it('excludes primary key columns', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).not.toHaveProperty('id');
    });

    it('excludes readOnly columns', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).not.toHaveProperty('createdAt');
    });

    it('excludes autoUpdate columns (via isReadOnly)', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).not.toHaveProperty('updatedAt');
    });

    it('excludes hidden columns', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).not.toHaveProperty('passwordHash');
    });

    it('includes sensitive columns (writable, hidden from responses only)', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).toHaveProperty('apiSecret');
    });

    it('includes columns with defaults as optional', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      // role has default('member') — should be optional in create
      const result = apiCreateBody.safeParse({
        name: 'Alice',
        email: 'alice@example.com',
        apiSecret: 'sk-123',
        // role omitted — should be valid
      });
      expect(result.ok).toBe(true);
    });

    it('accepts columns with defaults when provided', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      const result = apiCreateBody.safeParse({
        name: 'Alice',
        email: 'alice@example.com',
        apiSecret: 'sk-123',
        role: 'admin',
      });
      expect(result.ok).toBe(true);
    });

    it('includes required columns without defaults', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      expect(apiCreateBody.shape).toHaveProperty('name');
      expect(apiCreateBody.shape).toHaveProperty('email');
    });

    it('rejects unknown keys in strict mode', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      const result = apiCreateBody.safeParse({
        name: 'Alice',
        email: 'alice@example.com',
        apiSecret: 'sk-123',
        unknown_field: 'value',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects missing required fields', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      const result = apiCreateBody.safeParse({
        name: 'Alice',
        // email missing, apiSecret missing
      });
      expect(result.ok).toBe(false);
    });

    it('validates field types', () => {
      const { apiCreateBody } = tableToSchemas(accounts);
      const result = apiCreateBody.safeParse({
        name: 123, // wrong type
        email: 'alice@example.com',
        apiSecret: 'sk-123',
      });
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // apiUpdateBody
  // -------------------------------------------------------------------------

  describe('apiUpdateBody', () => {
    it('excludes primary key columns', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      expect(apiUpdateBody.shape).not.toHaveProperty('id');
    });

    it('excludes readOnly columns', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      expect(apiUpdateBody.shape).not.toHaveProperty('createdAt');
    });

    it('excludes autoUpdate columns (via isReadOnly)', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      expect(apiUpdateBody.shape).not.toHaveProperty('updatedAt');
    });

    it('excludes hidden columns', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      expect(apiUpdateBody.shape).not.toHaveProperty('passwordHash');
    });

    it('includes sensitive columns', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      expect(apiUpdateBody.shape).toHaveProperty('apiSecret');
    });

    it('makes all remaining columns optional', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      const result = apiUpdateBody.safeParse({});
      expect(result.ok).toBe(true);
    });

    it('accepts partial updates', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      const result = apiUpdateBody.safeParse({ name: 'Bob' });
      expect(result.ok).toBe(true);
    });

    it('rejects unknown keys in strict mode', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      const result = apiUpdateBody.safeParse({
        name: 'Bob',
        created_at: '2024-01-01',
      });
      expect(result.ok).toBe(false);
    });

    it('validates field types', () => {
      const { apiUpdateBody } = tableToSchemas(accounts);
      const result = apiUpdateBody.safeParse({
        role: 'invalid-role',
      });
      expect(result.ok).toBe(false);
    });
  });
});
