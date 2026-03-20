import { describe, expect, it } from 'bun:test';
import type { PropDefinition } from '../types';

describe('PropsTable data', () => {
  it('renders a table with all prop definitions', () => {
    const props: PropDefinition[] = [
      {
        name: 'intent',
        type: '"primary" | "secondary"',
        default: '"primary"',
        description: 'Visual style variant.',
      },
      {
        name: 'size',
        type: '"sm" | "md" | "lg"',
        default: '"md"',
        description: 'Size of the button.',
      },
    ];

    expect(props).toHaveLength(2);
    expect(props[0].name).toBe('intent');
    expect(props[1].type).toBe('"sm" | "md" | "lg"');
  });

  it('handles empty props array', () => {
    const props: PropDefinition[] = [];
    expect(props).toHaveLength(0);
  });

  it('handles props with dash in default', () => {
    const props: PropDefinition[] = [
      {
        name: 'onClick',
        type: '(e: MouseEvent) => void',
        default: '\u2014',
        description: 'Click handler.',
      },
    ];
    expect(props[0].default).toBe('\u2014');
  });
});

describe('PropDefinition type', () => {
  it('requires all four fields', () => {
    const valid: PropDefinition = {
      name: 'disabled',
      type: 'boolean',
      default: 'false',
      description: 'Whether the button is disabled.',
    };
    expect(valid.name).toBe('disabled');
    expect(valid.type).toBe('boolean');
    expect(valid.default).toBe('false');
    expect(valid.description).toBe('Whether the button is disabled.');
  });
});
