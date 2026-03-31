import type { PropDefinition } from '../types';

export const toggleProps: PropDefinition[] = [
  {
    name: 'defaultPressed',
    type: 'boolean',
    default: 'false',
    description: 'Initial pressed state of the toggle.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the toggle is disabled.',
  },
  {
    name: 'onPressedChange',
    type: '(pressed: boolean) => void',
    default: '\u2014',
    description: 'Callback when the pressed state changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Toggle content.',
  },
];
