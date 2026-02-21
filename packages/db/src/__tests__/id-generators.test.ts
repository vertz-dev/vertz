import { describe, expect, it } from 'vitest';
import { generateId } from '../id/generators';

describe('ID Generators', () => {
  // Test 1: generateId('cuid') returns string matching /^[a-z0-9]{24,}$/
  it('generates CUID2 in correct format', () => {
    const id = generateId('cuid');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-z0-9]{24,}$/);
  });

  // Test 2: generateId('uuid') returns string matching UUID format
  it('generates UUID in correct format', () => {
    const id = generateId('uuid');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  // Test 3: generateId('uuid') returns v7 UUID (version nibble = 7)
  it('generates UUID v7 specifically', () => {
    const id = generateId('uuid');
    const versionChar = id.charAt(14); // version nibble position in UUID string
    expect(versionChar).toBe('7');
  });

  // Test 4: generateId('nanoid') returns string of length 21
  it('generates Nano ID with length 21', () => {
    const id = generateId('nanoid');
    expect(typeof id).toBe('string');
    expect(id.length).toBe(21);
  });

  // Test 5: 1000 calls per strategy produce 1000 unique values
  it('generates unique IDs for each strategy', () => {
    const strategies: Array<'cuid' | 'uuid' | 'nanoid'> = ['cuid', 'uuid', 'nanoid'];
    
    for (const strategy of strategies) {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId(strategy));
      }
      expect(ids.size).toBe(1000);
    }
  });

  // Test 6: Unknown strategy throws (runtime guard)
  it('throws on unknown strategy', () => {
    expect(() => {
      // @ts-expect-error - testing runtime guard
      generateId('invalid');
    }).toThrow();
  });
});
