import { describe, expect, it } from 'bun:test';
import { descriptions } from '../content/registry';

const PHASE_4_COMPONENTS = [
  'button',
  'badge',
  'input',
  'label',
  'textarea',
  'separator',
  'breadcrumb',
  'pagination',
];

describe('Content registry', () => {
  it('has descriptions for all Phase 4 components', () => {
    for (const name of PHASE_4_COMPONENTS) {
      expect(descriptions[name]).toBeDefined();
    }
  });

  it('each description is a non-empty string', () => {
    for (const name of PHASE_4_COMPONENTS) {
      expect(typeof descriptions[name]).toBe('string');
      expect(descriptions[name].length).toBeGreaterThan(0);
    }
  });

  it('does not have entries for undocumented components', () => {
    const key = 'nonexistent';
    expect(descriptions[key]).toBeUndefined();
  });
});
