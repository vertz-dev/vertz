import type { PropDefinition } from '../types';

export const drawerProps: PropDefinition[] = [
  {
    name: 'side',
    type: '"left" | "right" | "top" | "bottom"',
    default: '"bottom"',
    description: 'Side of the screen the drawer slides from.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the drawer opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Drawer content including Trigger, Content, and other sub-components.',
  },
];
