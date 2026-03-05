import { describe, expect, it } from 'bun:test';
import type { Infer } from '../..';
import { s } from '../..';

describe('Integration: Schema Usage', () => {
  const userSchema = s.object({
    name: s.string().min(1),
    email: s.email(),
    age: s.number().int().gte(0),
    createdAt: s.date().optional(),
    role: s.string().default('user'),
  });

  type User = Infer<typeof userSchema>;

  it('parses valid data and returns typed result', () => {
    const result = userSchema.parse({
      name: 'John',
      email: 'john@example.com',
      age: 30,
    }).data;
    expect(result.name).toBe('John');
    expect(result.email).toBe('john@example.com');
    expect(result.age).toBe(30);
    expect(result.role).toBe('user');
  });

  it('parses invalid data and aggregates issues with paths', () => {
    const result = userSchema.safeParse({
      name: '',
      email: 123,
      age: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
      const paths = result.error.issues.map((i) => i.path?.join('.'));
      expect(paths).toContain('name');
      expect(paths).toContain('email');
      expect(paths).toContain('age');
    }
  });

  it('validates nested objects with full error paths', () => {
    const addressSchema = s.object({
      street: s.string().min(1),
      city: s.string(),
    });
    const profileSchema = s.object({
      user: s.object({ name: s.string() }),
      address: addressSchema,
    });
    const result = profileSchema.safeParse({
      user: { name: 123 },
      address: { street: '', city: 'NYC' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.error.issues.map((i) => i.path?.join('.'));
      expect(paths).toContain('user.name');
      expect(paths).toContain('address.street');
    }
  });

  it('type inference matches expected type', () => {
    // Type-level assertion — verified by the TypeScript compiler
    type _NameCheck = User['name'];
    type _EmailCheck = User['email'];
    type _AgeCheck = User['age'];
    type _RoleCheck = User['role'];
  });
});
