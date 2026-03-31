import type { PropDefinition } from '../types';

export const skeletonProps: PropDefinition[] = [
  {
    name: 'width',
    type: 'string',
    default: '\u2014',
    description: 'Width of the skeleton placeholder.',
  },
  {
    name: 'height',
    type: 'string',
    default: '\u2014',
    description: 'Height of the skeleton placeholder.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];

export const skeletonTextProps: PropDefinition[] = [
  {
    name: 'lines',
    type: 'number',
    default: '3',
    description: 'Number of lines to render.',
  },
  {
    name: 'lastLineWidth',
    type: 'string',
    default: '"75%"',
    description: 'Width of the last line.',
  },
  {
    name: 'height',
    type: 'string',
    default: '\u2014',
    description: 'Height of each line.',
  },
  {
    name: 'gap',
    type: 'string',
    default: '\u2014',
    description: 'Gap between lines. Overrides the CSS class gap when provided.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];

export const skeletonCircleProps: PropDefinition[] = [
  {
    name: 'size',
    type: 'string',
    default: '"2.5rem"',
    description: 'Diameter of the circle.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
