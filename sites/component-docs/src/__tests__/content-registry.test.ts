import { describe, expect, it } from 'bun:test';
import { descriptions } from '../content/registry';

const DOCUMENTED_COMPONENTS = [
  // Simple
  'button',
  'badge',
  'input',
  'label',
  'textarea',
  'separator',
  'breadcrumb',
  'pagination',
  // Compound / suite
  'dialog',
  'alert-dialog',
  'select',
  'tabs',
  'accordion',
  'card',
  'table',
  'alert',
];

describe('Content registry', () => {
  it('has descriptions for all documented components', () => {
    for (const name of DOCUMENTED_COMPONENTS) {
      expect(descriptions[name]).toBeDefined();
    }
  });

  it('each description is a non-empty string', () => {
    for (const name of DOCUMENTED_COMPONENTS) {
      expect(typeof descriptions[name]).toBe('string');
      expect(descriptions[name].length).toBeGreaterThan(0);
    }
  });

  it('does not have entries for undocumented components', () => {
    const key = 'nonexistent';
    expect(descriptions[key]).toBeUndefined();
  });
});
