import type { PropDefinition } from '../types';

export const carouselProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: '"horizontal" | "vertical"',
    default: '"horizontal"',
    description: 'Scroll direction of the carousel.',
  },
  {
    name: 'loop',
    type: 'boolean',
    default: 'false',
    description: 'Whether the carousel loops back to the start.',
  },
  {
    name: 'defaultIndex',
    type: 'number',
    default: '0',
    description: 'Initial active slide index.',
  },
  {
    name: 'onSlideChange',
    type: '(index: number) => void',
    default: '\u2014',
    description: 'Callback when the active slide changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Carousel content including Slide, Previous, and Next sub-components.',
  },
];
