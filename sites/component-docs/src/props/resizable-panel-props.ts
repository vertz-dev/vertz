import type { PropDefinition } from '../types';

export const resizablePanelProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: '"horizontal" | "vertical"',
    default: '"horizontal"',
    description: 'Direction of the panel layout.',
  },
  {
    name: 'onResize',
    type: '(sizes: number[]) => void',
    default: '\u2014',
    description: 'Callback when panel sizes change.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'ResizablePanel content including Panel and Handle sub-components.',
  },
];

export const resizablePanelPanelProps: PropDefinition[] = [
  {
    name: 'defaultSize',
    type: 'number',
    default: '\u2014',
    description: 'Initial size of the panel as a percentage.',
  },
  {
    name: 'minSize',
    type: 'number',
    default: '\u2014',
    description: 'Minimum size of the panel as a percentage.',
  },
  {
    name: 'maxSize',
    type: 'number',
    default: '\u2014',
    description: 'Maximum size of the panel as a percentage.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Panel content.',
  },
];
