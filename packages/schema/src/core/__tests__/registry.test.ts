import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry } from '../registry';

describe('SchemaRegistry', () => {
  beforeEach(() => {
    SchemaRegistry.clear();
  });

  it('registers and retrieves a schema by name', () => {
    const fakeSchema = { _id: 'User' } as any;
    SchemaRegistry.register('User', fakeSchema);

    expect(SchemaRegistry.has('User')).toBe(true);
    expect(SchemaRegistry.get('User')).toBe(fakeSchema);
  });

  it('getAll returns all registered schemas and clear empties the registry', () => {
    const schema1 = { _id: 'User' } as any;
    const schema2 = { _id: 'Post' } as any;
    SchemaRegistry.register('User', schema1);
    SchemaRegistry.register('Post', schema2);

    const all = SchemaRegistry.getAll();
    expect(all.size).toBe(2);
    expect(all.get('User')).toBe(schema1);

    SchemaRegistry.clear();
    expect(SchemaRegistry.has('User')).toBe(false);
    expect(SchemaRegistry.getAll().size).toBe(0);
  });

  it('overwrites when registering same name', () => {
    const schema1 = { _id: 'User', version: 1 } as any;
    const schema2 = { _id: 'User', version: 2 } as any;
    SchemaRegistry.register('User', schema1);
    SchemaRegistry.register('User', schema2);

    expect(SchemaRegistry.get('User')).toBe(schema2);
    expect(SchemaRegistry.getAll().size).toBe(1);
  });
});
