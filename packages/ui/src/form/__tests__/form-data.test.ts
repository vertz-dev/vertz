import { describe, expect, it } from 'bun:test';
import { formDataToObject } from '../form-data';

describe('formDataToObject', () => {
  it('converts FormData with string values to a plain object', () => {
    const fd = new FormData();
    fd.append('name', 'Alice');
    fd.append('email', 'alice@example.com');

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('returns an empty object for empty FormData', () => {
    const fd = new FormData();

    const result = formDataToObject(fd);

    expect(result).toEqual({});
  });

  it('uses the last value when a key appears multiple times', () => {
    const fd = new FormData();
    fd.append('color', 'red');
    fd.append('color', 'blue');

    const result = formDataToObject(fd);

    expect(result).toEqual({ color: 'blue' });
  });

  it('coerces numeric strings to numbers when coerce option is enabled', () => {
    const fd = new FormData();
    fd.append('age', '25');
    fd.append('name', 'Bob');

    const result = formDataToObject(fd, { coerce: true });

    expect(result).toEqual({ age: 25, name: 'Bob' });
  });

  it('coerces boolean strings when coerce option is enabled', () => {
    const fd = new FormData();
    fd.append('active', 'true');
    fd.append('deleted', 'false');
    fd.append('name', 'Carol');

    const result = formDataToObject(fd, { coerce: true });

    expect(result).toEqual({ active: true, deleted: false, name: 'Carol' });
  });

  it('skips File entries and only includes string values', () => {
    const fd = new FormData();
    fd.append('name', 'Dave');
    fd.append('avatar', new File(['content'], 'avatar.png', { type: 'image/png' }));

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: 'Dave' });
  });

  it('handles empty string values', () => {
    const fd = new FormData();
    fd.append('name', '');
    fd.append('bio', '');

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: '', bio: '' });
  });

  it('does not coerce by default', () => {
    const fd = new FormData();
    fd.append('count', '42');
    fd.append('active', 'true');

    const result = formDataToObject(fd);

    expect(result).toEqual({ count: '42', active: 'true' });
  });

  describe('nested dot-path parsing (nested: true)', () => {
    it('parses "address.street" into { address: { street: value } }', () => {
      const fd = new FormData();
      fd.append('address.street', '123 Main St');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({ address: { street: '123 Main St' } });
    });

    it('parses multiple nested keys into the same parent object', () => {
      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('address.street', '123 Main');
      fd.append('address.city', 'Springfield');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({
        name: 'Alice',
        address: { street: '123 Main', city: 'Springfield' },
      });
    });

    it('handles deeply nested paths (3+ levels)', () => {
      const fd = new FormData();
      fd.append('a.b.c.d', 'deep');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
    });

    it('creates arrays for numeric indices', () => {
      const fd = new FormData();
      fd.append('items.0.name', 'Widget');
      fd.append('items.1.name', 'Gadget');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({
        items: [{ name: 'Widget' }, { name: 'Gadget' }],
      });
    });

    it('passes sparse indices through as-is (holes are undefined)', () => {
      const fd = new FormData();
      fd.append('items.0.name', 'First');
      fd.append('items.3.name', 'Fourth');

      const result = formDataToObject(fd, { nested: true });

      expect(result.items).toBeArray();
      const items = result.items as Array<unknown>;
      expect(items[0]).toEqual({ name: 'First' });
      expect(items[1]).toBeUndefined();
      expect(items[2]).toBeUndefined();
      expect(items[3]).toEqual({ name: 'Fourth' });
    });

    it('handles mixed object and array nesting', () => {
      const fd = new FormData();
      fd.append('order.items.0.product', 'Widget');
      fd.append('order.items.0.quantity', '5');
      fd.append('order.items.1.product', 'Gadget');
      fd.append('order.note', 'Rush order');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({
        order: {
          items: [{ product: 'Widget', quantity: '5' }, { product: 'Gadget' }],
          note: 'Rush order',
        },
      });
    });

    it('preserves flat keys without dots unchanged', () => {
      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('email', 'alice@example.com');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' });
    });

    it('coercion works with nested paths', () => {
      const fd = new FormData();
      fd.append('user.age', '25');
      fd.append('user.active', 'true');

      const result = formDataToObject(fd, { nested: true, coerce: true });

      expect(result).toEqual({ user: { age: 25, active: true } });
    });
  });

  describe('prototype pollution guard (nested: true)', () => {
    it('ignores __proto__ segments', () => {
      const fd = new FormData();
      fd.append('__proto__.isAdmin', 'true');
      fd.append('name', 'Alice');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({ name: 'Alice' });
      // Ensure Object.prototype was NOT polluted
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });

    it('ignores constructor segments', () => {
      const fd = new FormData();
      fd.append('constructor.prototype.isAdmin', 'true');

      const result = formDataToObject(fd, { nested: true });

      expect(result).toEqual({});
    });

    it('ignores prototype as a leaf segment', () => {
      const fd = new FormData();
      fd.append('a.prototype', 'value');

      const result = formDataToObject(fd, { nested: true });

      // 'a' is created as intermediate, but 'prototype' value is dropped
      expect(result).toEqual({ a: {} });
      expect((result.a as Record<string, unknown>).prototype).toBeUndefined();
    });
  });

  describe('backward compatibility (without nested option)', () => {
    it('preserves dot-containing keys as flat strings', () => {
      const fd = new FormData();
      fd.append('address.street', '123 Main');
      fd.append('address.city', 'Springfield');

      const result = formDataToObject(fd);

      expect(result).toEqual({
        'address.street': '123 Main',
        'address.city': 'Springfield',
      });
    });
  });
});
