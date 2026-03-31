import { describe, expect, it } from 'bun:test';
import { PRESETS, resolveFeatures } from '../registry.js';

describe('PRESETS', () => {
  it('defines api preset', () => {
    expect(PRESETS.api).toEqual(['core', 'api', 'db', 'entity-example']);
  });

  it('defines ui preset (alias: hello-world)', () => {
    expect(PRESETS.ui).toEqual(['core', 'ui', 'router']);
    expect(PRESETS['hello-world']).toEqual(PRESETS.ui);
  });

  it('defines full-stack preset with router', () => {
    expect(PRESETS['full-stack']).toEqual([
      'core', 'api', 'db', 'entity-example', 'ui', 'router', 'client',
    ]);
  });

  it('defines todo-app preset (legacy, no router)', () => {
    expect(PRESETS['todo-app']).toEqual([
      'core', 'api', 'db', 'entity-example', 'ui', 'client',
    ]);
  });
});

describe('resolveFeatures', () => {
  it('resolves a preset name to Feature instances', () => {
    const features = resolveFeatures({ template: 'api' });

    const names = features.map((f) => f.name);
    expect(names).toEqual(['core', 'api', 'db', 'entity-example']);
  });

  it('resolves custom --with feature list', () => {
    const features = resolveFeatures({ withFeatures: ['api', 'ui'] });

    const names = features.map((f) => f.name);
    // Should auto-resolve dependencies: api needs core, ui needs core
    expect(names).toContain('core');
    expect(names).toContain('api');
    expect(names).toContain('ui');
  });

  it('auto-resolves transitive dependencies for --with', () => {
    const features = resolveFeatures({ withFeatures: ['entity-example'] });

    const names = features.map((f) => f.name);
    // entity-example → db → api → core
    expect(names).toContain('core');
    expect(names).toContain('api');
    expect(names).toContain('db');
    expect(names).toContain('entity-example');
  });

  it('throws on unknown preset', () => {
    expect(() => resolveFeatures({ template: 'nonexistent' })).toThrow('Unknown template');
  });

  it('throws on unknown feature in --with', () => {
    expect(() => resolveFeatures({ withFeatures: ['nonexistent'] })).toThrow('Unknown feature');
  });

  it('deduplicates features when --with includes overlapping deps', () => {
    const features = resolveFeatures({ withFeatures: ['api', 'db'] });

    const names = features.map((f) => f.name);
    const uniqueNames = [...new Set(names)];
    expect(names).toEqual(uniqueNames);
  });
});
