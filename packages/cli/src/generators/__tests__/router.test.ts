import { describe, expect, it } from 'vitest';
import { generateRouter } from '../router';

describe('generateRouter', () => {
  it('generates router file at correct path', () => {
    const files = generateRouter('order', 'order', 'src');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/modules/order/order.router.ts');
  });

  it('uses kebab-case for file names', () => {
    const files = generateRouter('UserProfile', 'user-auth', 'src');
    expect(files[0]?.path).toBe('src/modules/user-auth/user-profile.router.ts');
  });

  it('router content imports createRouter', () => {
    const files = generateRouter('order', 'order', 'src');
    expect(files[0]?.content).toContain('createRouter');
  });

  it('uses provided module name in path', () => {
    const files = generateRouter('item', 'order', 'src');
    expect(files[0]?.path).toBe('src/modules/order/item.router.ts');
  });
});
