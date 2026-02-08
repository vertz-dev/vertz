import { describe, expect, it } from 'vitest';
import { generateService } from '../service';

describe('generateService', () => {
  it('generates service file at correct path', () => {
    const files = generateService('order', 'order', 'src');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/modules/order/order.service.ts');
  });

  it('uses kebab-case for file names', () => {
    const files = generateService('UserProfile', 'user-auth', 'src');
    expect(files[0]?.path).toBe('src/modules/user-auth/user-profile.service.ts');
  });

  it('service content exports a function', () => {
    const files = generateService('order', 'order', 'src');
    expect(files[0]?.content).toContain('export function');
  });

  it('uses provided module name in path', () => {
    const files = generateService('item', 'order', 'src');
    expect(files[0]?.path).toBe('src/modules/order/item.service.ts');
  });
});
