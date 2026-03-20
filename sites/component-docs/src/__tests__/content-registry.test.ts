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
  // Form
  'checkbox',
  'date-picker',
  'form-group',
  'radio-group',
  'slider',
  'switch',
  'toggle',
  // Layout
  'resizable-panel',
  'scroll-area',
  'skeleton',
  // Data Display
  'avatar',
  'calendar',
  'progress',
  // Feedback
  'drawer',
  'sheet',
  'toast',
  // Navigation
  'command',
  'menubar',
  'navigation-menu',
  // Overlay
  'context-menu',
  'dropdown-menu',
  'hover-card',
  'popover',
  'tooltip',
  // Disclosure
  'carousel',
  'collapsible',
  'toggle-group',
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
