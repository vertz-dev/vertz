import type { PropDefinition } from '../types';

export const toggleGroupProps: PropDefinition[] = [
  {
    name: 'type',
    type: '"single" | "multiple"',
    default: '"single"',
    description: 'Whether one or multiple items can be active at once.',
  },
  {
    name: 'defaultValue',
    type: 'string[]',
    default: '[]',
    description: 'Array of initially active item values.',
  },
  {
    name: 'orientation',
    type: '"horizontal" | "vertical"',
    default: '"horizontal"',
    description: 'Layout direction of the toggle group.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the toggle group is disabled.',
  },
  {
    name: 'onValueChange',
    type: '(value: string[]) => void',
    default: '\u2014',
    description: 'Callback when the active values change.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'ToggleGroup content including Item sub-components.',
  },
];

export const toggleGroupItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this toggle item.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Toggle item content.',
  },
];
