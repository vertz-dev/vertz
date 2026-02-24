import { describe, it, expect } from 'bun:test';
import { shallowMerge, shallowEqual } from '../merge';

describe('shallowMerge', () => {
  it('adds new fields', () => {
    const existing = { id: '1', name: 'Alice' };
    const incoming = { age: 30 };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it('overwrites changed fields', () => {
    const existing = { id: '1', name: 'Alice', age: 25 };
    const incoming = { age: 30 };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it('preserves untouched fields', () => {
    const existing = { id: '1', name: 'Alice', age: 25, city: 'NYC' };
    const incoming = { age: 30 };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', name: 'Alice', age: 30, city: 'NYC' });
  });

  it('ignores undefined values in incoming', () => {
    const existing = { id: '1', name: 'Alice', age: 25 };
    const incoming = { age: undefined, city: 'NYC' };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', name: 'Alice', age: 25, city: 'NYC' });
  });

  it('replaces arrays (not deep merge)', () => {
    const existing = { id: '1', tags: ['old', 'stale'] };
    const incoming = { tags: ['new'] };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', tags: ['new'] });
    expect(result.tags).toBe(incoming.tags); // reference equality
  });

  it('replaces nested objects (not deep merge)', () => {
    const existing = { id: '1', address: { city: 'SF', zip: '94102' } };
    const incoming = { address: { city: 'NYC' } };
    const result = shallowMerge(existing, incoming);
    expect(result).toEqual({ id: '1', address: { city: 'NYC' } });
    expect(result.address).toBe(incoming.address); // reference equality
  });
});

describe('shallowEqual', () => {
  it('returns true for identical objects', () => {
    const obj = { id: '1', name: 'Alice' };
    expect(shallowEqual(obj, obj)).toBe(true);
  });

  it('returns true for same-value objects', () => {
    const a = { id: '1', name: 'Alice' };
    const b = { id: '1', name: 'Alice' };
    expect(shallowEqual(a, b)).toBe(true);
  });

  it('returns false for different values', () => {
    const a = { id: '1', name: 'Alice' };
    const b = { id: '1', name: 'Bob' };
    expect(shallowEqual(a, b)).toBe(false);
  });

  it('returns false for added fields', () => {
    const a = { id: '1', name: 'Alice' };
    const b = { id: '1', name: 'Alice', age: 30 };
    expect(shallowEqual(a, b)).toBe(false);
  });

  it('returns false for removed fields', () => {
    const a = { id: '1', name: 'Alice', age: 30 };
    const b = { id: '1', name: 'Alice' };
    expect(shallowEqual(a, b)).toBe(false);
  });

  it('handles null values', () => {
    const a = { id: '1', name: null };
    const b = { id: '1', name: null };
    expect(shallowEqual(a, b)).toBe(true);
  });

  it('handles undefined values', () => {
    const a = { id: '1', name: undefined };
    const b = { id: '1', name: undefined };
    expect(shallowEqual(a, b)).toBe(true);
  });

  it('distinguishes null from undefined', () => {
    const a = { id: '1', name: null };
    const b = { id: '1', name: undefined };
    expect(shallowEqual(a, b)).toBe(false);
  });
});
