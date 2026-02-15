import { describe, expect, it } from 'vitest';
import { generateClient } from '../client-gen';

/**
 * Client generation tests (DB-CG-006 to DB-CG-010).
 *
 * Tests that the codegen generates a typed client with CRUD methods.
 *
 * Acceptance criteria:
 * - DB-CG-006: Generated client has .user.list(), .user.get(), .user.create(), .user.update(), .user.delete()
 * - DB-CG-007: list() returns array of typed entity
 * - DB-CG-008: get() returns single typed entity or null
 * - DB-CG-009: create() accepts typed input (required fields only)
 * - DB-CG-010: update() accepts partial typed input
 * - DB-CG-011: Filter/where clauses are typed per entity fields
 */
describe('Client Generation (DB-CG-006 to DB-CG-011)', () => {
  const domains = [
    {
      name: 'user',
      fields: {
        id: { type: 'uuid', primary: true },
        name: { type: 'string', required: true },
        email: { type: 'string', required: true },
        age: { type: 'number', required: false },
      },
    },
    {
      name: 'post',
      fields: {
        id: { type: 'uuid', primary: true },
        title: { type: 'string', required: true },
        authorId: { type: 'uuid', references: 'user' },
        published: { type: 'boolean', required: false },
      },
      relations: {
        author: { type: 'belongsTo', target: 'user', foreignKey: 'authorId' },
      },
    },
  ];

  // DB-CG-006: Generated client has all CRUD methods
  it('DB-CG-006: generates client with all CRUD methods per entity', () => {
    const result = generateClient(domains);

    expect(result).toContain('export const db =');
    expect(result).toContain('user: {');
    expect(result).toContain('list:');
    expect(result).toContain('get:');
    expect(result).toContain('create:');
    expect(result).toContain('update:');
    expect(result).toContain('delete:');
    expect(result).toContain('post: {');
  });

  // DB-CG-007: list() returns array of typed entity
  it('DB-CG-007: list() returns array of typed entity', () => {
    const result = generateClient(domains);

    expect(result).toContain('list(): Promise<User[]>');
    expect(result).toContain('list(): Promise<Post[]>');
  });

  // DB-CG-008: get() returns single typed entity or null
  it('DB-CG-008: get() returns single typed entity or null', () => {
    const result = generateClient(domains);

    expect(result).toContain('get(id: string): Promise<User | null>');
    expect(result).toContain('get(id: string): Promise<Post | null>');
  });

  // DB-CG-009: create() accepts typed input (required fields only)
  it('DB-CG-009: create() accepts typed input with required fields only', () => {
    const result = generateClient(domains);

    expect(result).toContain('create(data: CreateUserInput): Promise<User>');
    expect(result).toContain('interface CreateUserInput');
    expect(result).toContain('name: string;');
    expect(result).toContain('email: string;');
    // Extract just the CreateUserInput block and check it doesn't have optional fields
    const createInputBlock = result.split('interface CreateUserInput')[1]?.split('}')[0] || '';
    expect(createInputBlock).not.toContain('age');
  });

  // DB-CG-010: update() accepts partial typed input
  it('DB-CG-010: update() accepts partial typed input', () => {
    const result = generateClient(domains);

    expect(result).toContain('update(id: string, data: UpdateUserInput): Promise<User>');
    expect(result).toContain('interface UpdateUserInput');
    // All fields should be optional in update
    expect(result).toContain('name?: string;');
    expect(result).toContain('email?: string;');
    expect(result).toContain('age?: number;');
  });

  // DB-CG-011: Filter/where clauses are typed per entity fields
  it('DB-CG-011: generates typed filter/where clauses', () => {
    const result = generateClient(domains);

    expect(result).toContain('list(params?: ListUserParams): Promise<User[]>');
    expect(result).toContain('interface ListUserParams');
    expect(result).toContain('where?: UserWhere');
    expect(result).toContain('orderBy?: UserOrderBy');
    expect(result).toContain('limit?: number');
    expect(result).toContain('offset?: number');

    expect(result).toContain('interface UserWhere');
    expect(result).toContain('id?: string');
    expect(result).toContain('name?: string');
    expect(result).toContain('email?: string');
    expect(result).toContain('age?: number');
  });

  // Test that relations are accessible on entities
  it('DB-CG-012: generates typed relation accessors', () => {
    const result = generateClient(domains);

    // Post has belongsTo author relation
    expect(result).toContain('author: {');
    expect(result).toContain('get(postId: string): Promise<User | null>');
  });
});
