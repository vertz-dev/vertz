import type { PropDefinition } from '../types';

export const sheetProps: PropDefinition[] = [
  {
    name: 'side',
    type: '"left" | "right" | "top" | "bottom"',
    default: '"right"',
    description: 'Side of the screen the sheet slides from.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the sheet opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Sheet content including Trigger, Content, and other sub-components.',
  },
];

export const sheetContentProps: PropDefinition[] = [
  {
    name: 'showClose',
    type: 'boolean',
    default: 'true',
    description: 'Whether to show the close button.',
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
    description: 'Content to render inside the sheet.',
  },
];
