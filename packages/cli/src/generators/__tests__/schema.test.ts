import { describe, expect, it } from 'bun:test';
import { generateSchema } from '../schema';

describe('generateSchema', () => {
  it('generates schema file at correct path under schemas/', () => {
    const files = generateSchema('order', 'order', 'src');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/modules/order/schemas/order.schema.ts');
  });

  it('uses kebab-case for file names', () => {
    const files = generateSchema('UserProfile', 'user-auth', 'src');
    expect(files[0]?.path).toBe('src/modules/user-auth/schemas/user-profile.schema.ts');
  });

  it('schema content uses z.object with createSchema', () => {
    const files = generateSchema('order', 'order', 'src');
    expect(files[0]?.content).toContain('z.object');
    expect(files[0]?.content).toContain('createSchema');
  });

  it('uses PascalCase for schema name in content', () => {
    const files = generateSchema('user-profile', 'user-auth', 'src');
    expect(files[0]?.content).toContain('UserProfile');
  });
});
