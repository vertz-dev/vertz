import { describe, expect, it } from 'vitest';
import { generateTypes } from '../type-gen';

/**
 * Type generation tests (DB-CG-001).
 *
 * Tests that the codegen correctly generates TypeScript interfaces
 * from domain definitions.
 *
 * Acceptance criteria:
 * - DB-CG-001: Generates correct TypeScript interface from domain fields
 * - DB-CG-002: Handles all field types (string, number, boolean, date, enum, json)
 * - DB-CG-003: Generates list/get/create/update/delete method signatures
 * - DB-CG-004: Handles optional vs required fields
 * - DB-CG-005: Handles relations (belongsTo, hasMany)
 */
describe('Type Generation (DB-CG-001 to DB-CG-005)', () => {
  // DB-CG-001: Basic interface generation from domain fields
  it('DB-CG-001: generates correct TypeScript interface from domain fields', () => {
    const domain = {
      name: 'user',
      fields: {
        id: { type: 'uuid', primary: true },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    };

    const result = generateTypes(domain);

    expect(result).toContain('interface User {');
    expect(result).toContain('id: string;');
    expect(result).toContain('name: string;');
    expect(result).toContain('email: string;');
  });

  // DB-CG-002: Handles all field types
  it('DB-CG-002: handles all field types correctly', () => {
    const domain = {
      name: 'example',
      fields: {
        stringField: { type: 'string' },
        numberField: { type: 'number' },
        booleanField: { type: 'boolean' },
        dateField: { type: 'date' },
        jsonField: { type: 'json' },
        uuidField: { type: 'uuid' },
        enumField: { type: 'enum', enumName: 'Status', enumValues: ['active', 'inactive'] },
      },
    };

    const result = generateTypes(domain);

    expect(result).toContain('stringField: string;');
    expect(result).toContain('numberField: number;');
    expect(result).toContain('booleanField: boolean;');
    expect(result).toContain('dateField: Date;');
    expect(result).toContain('jsonField: unknown;');
    expect(result).toContain('uuidField: string;');
    expect(result).toContain('enumField: Status;');
    expect(result).toContain('enum Status');
  });

  // DB-CG-003: Generates CRUD method signatures
  it('DB-CG-003: generates list/get/create/update/delete method signatures', () => {
    const domain = {
      name: 'user',
      fields: {
        id: { type: 'uuid', primary: true },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    };

    const result = generateTypes(domain);

    expect(result).toContain('list(): Promise<User[]>');
    expect(result).toContain('get(id: string): Promise<User | null>');
    expect(result).toContain('create(data: CreateUserInput): Promise<User>');
    expect(result).toContain('update(id: string, data: UpdateUserInput): Promise<User>');
    expect(result).toContain('delete(id: string): Promise<void>');
  });

  // DB-CG-004: Handles optional vs required fields
  it('DB-CG-004: handles optional fields correctly', () => {
    const domain = {
      name: 'user',
      fields: {
        id: { type: 'uuid', primary: true },
        name: { type: 'string', required: true },
        email: { type: 'string', required: false },
        bio: { type: 'string', required: false },
      },
    };

    const result = generateTypes(domain);

    // Required fields should not have ?
    expect(result).toContain('id: string;');
    expect(result).toContain('name: string;');

    // Optional fields should have ?
    expect(result).toContain('email?: string;');
    expect(result).toContain('bio?: string;');

    // Create input should only have required fields
    expect(result).toContain('interface CreateUserInput');
    expect(result).toContain('name: string;');
    // Extract just the CreateUserInput block and check it doesn't have optional fields
    const createInputBlock = result.split('interface CreateUserInput')[1]?.split('}')[0] || '';
    expect(createInputBlock).not.toContain('email');
    expect(createInputBlock).not.toContain('bio');
  });

  // DB-CG-005: Handles relations
  it('DB-CG-005: handles belongsTo relations', () => {
    const domain = {
      name: 'post',
      fields: {
        id: { type: 'uuid', primary: true },
        title: { type: 'string' },
        authorId: { type: 'uuid', references: 'user' },
      },
      relations: {
        author: { type: 'belongsTo', target: 'user', foreignKey: 'authorId' },
      },
    };

    const result = generateTypes(domain);

    expect(result).toContain('author: () => Promise<User | null>');
  });

  it('DB-CG-005: handles hasMany relations', () => {
    const domain = {
      name: 'user',
      fields: {
        id: { type: 'uuid', primary: true },
        name: { type: 'string' },
      },
      relations: {
        posts: { type: 'hasMany', target: 'post', foreignKey: 'authorId' },
      },
    };

    const result = generateTypes(domain);

    expect(result).toContain('posts: () => Promise<Post[]>');
  });
});
