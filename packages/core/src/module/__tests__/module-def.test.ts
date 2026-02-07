import { describe, it, expect } from 'vitest';
import { createModuleDef } from '../module-def';

describe('createModuleDef', () => {
  it('captures module name', () => {
    const moduleDef = createModuleDef({ name: 'user' });

    expect(moduleDef.name).toBe('user');
  });

  it('captures imports and options schema', () => {
    const mockService = { findById: () => {} };
    const mockSchema = { parse: () => {} };

    const moduleDef = createModuleDef({
      name: 'user',
      imports: { dbService: mockService },
      options: mockSchema as unknown as import('@vertz/schema').Schema<unknown>,
    });

    expect(moduleDef.imports).toEqual({ dbService: mockService });
    expect(moduleDef.options).toBe(mockSchema);
  });
});
