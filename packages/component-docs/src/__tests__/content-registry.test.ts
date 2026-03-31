import { describe, expect, it } from 'bun:test';
import { descriptions } from '../content/registry';
import { components } from '../manifest';

describe('Content registry', () => {
  it('has descriptions for all manifest components', () => {
    for (const { name } of components) {
      expect(descriptions[name]).toBeDefined();
    }
  });

  it('each description is a non-empty string', () => {
    for (const { name } of components) {
      expect(typeof descriptions[name]).toBe('string');
      expect(descriptions[name].length).toBeGreaterThan(0);
    }
  });

  it('does not have entries for undocumented components', () => {
    const key = 'nonexistent';
    expect(descriptions[key]).toBeUndefined();
  });

  it('description keys match manifest component names exactly', () => {
    const manifestNames = new Set(components.map((c) => c.name));
    for (const key of Object.keys(descriptions)) {
      expect(manifestNames.has(key)).toBe(true);
    }
  });
});
