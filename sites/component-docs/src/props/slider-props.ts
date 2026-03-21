import type { PropDefinition } from '../types';

export const sliderProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'number',
    default: '0',
    description: 'Initial value of the slider.',
  },
  {
    name: 'min',
    type: 'number',
    default: '0',
    description: 'Minimum value.',
  },
  {
    name: 'max',
    type: 'number',
    default: '100',
    description: 'Maximum value.',
  },
  {
    name: 'step',
    type: 'number',
    default: '1',
    description: 'Step increment between values.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the slider is disabled.',
  },
  {
    name: 'onValueChange',
    type: '(value: number) => void',
    default: '\u2014',
    description: 'Callback when the slider value changes.',
  },
];
