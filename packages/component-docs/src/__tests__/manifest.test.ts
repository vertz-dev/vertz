import { describe, expect, it } from 'bun:test';
import {
  categoryOrder,
  components,
  findComponent,
  getAdjacentComponents,
  getComponentsByCategory,
} from '../manifest';

describe('Component manifest', () => {
  it('contains all expected components', () => {
    expect(components.length).toBeGreaterThanOrEqual(40);
  });

  it('has unique names for all components', () => {
    const names = components.map((c) => c.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('only uses known categories', () => {
    const validCategories = new Set<string>(categoryOrder);
    for (const entry of components) {
      expect(validCategories.has(entry.category)).toBe(true);
    }
  });

  it('has alphabetically sorted components within each category', () => {
    const grouped = getComponentsByCategory();
    for (const [, entries] of grouped) {
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].name >= entries[i - 1].name).toBe(true);
      }
    }
  });
});

describe('findComponent', () => {
  it('finds a component by name', () => {
    const entry = findComponent('button');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Button');
    expect(entry?.category).toBe('Form');
  });

  it('returns undefined for unknown names', () => {
    expect(findComponent('nonexistent')).toBeUndefined();
  });
});

describe('getAdjacentComponents', () => {
  it('returns prev and next for a middle component', () => {
    const { prev, next } = getAdjacentComponents('checkbox');
    expect(prev).toBeDefined();
    expect(next).toBeDefined();
    expect(prev?.name).toBe('button');
    expect(next?.name).toBe('combobox');
  });

  it('returns no prev for the first component', () => {
    const first = components[0];
    const { prev, next } = getAdjacentComponents(first.name);
    expect(prev).toBeUndefined();
    expect(next).toBeDefined();
  });

  it('returns no next for the last component', () => {
    const last = components[components.length - 1];
    const { prev, next } = getAdjacentComponents(last.name);
    expect(prev).toBeDefined();
    expect(next).toBeUndefined();
  });

  it('returns no prev/next for unknown name', () => {
    const { prev, next } = getAdjacentComponents('nonexistent');
    expect(prev).toBeUndefined();
    expect(next).toBeUndefined();
  });
});

describe('getComponentsByCategory', () => {
  it('groups components by category respecting categoryOrder', () => {
    const grouped = getComponentsByCategory();
    const keys = Array.from(grouped.keys());
    expect(keys).toEqual([...categoryOrder]);
  });

  it('includes all components across all categories', () => {
    const grouped = getComponentsByCategory();
    let total = 0;
    for (const [, entries] of grouped) {
      total += entries.length;
    }
    expect(total).toBe(components.length);
  });

  it('Form category contains expected components', () => {
    const grouped = getComponentsByCategory();
    const formNames = grouped.get('Form')?.map((c) => c.name) ?? [];
    expect(formNames).toContain('button');
    expect(formNames).toContain('input');
    expect(formNames).toContain('select');
  });
});
