import type { PropDefinition } from '../types';

export const listProps: PropDefinition[] = [
  {
    name: 'animate',
    type: 'boolean | AnimateConfig',
    default: 'false',
    description: 'Enable FLIP animations for enter, exit, and reorder transitions.',
  },
  {
    name: 'sortable',
    type: 'boolean',
    default: 'false',
    description: 'Enable drag-and-sort reordering.',
  },
  {
    name: 'onReorder',
    type: '(from: number, to: number) => void',
    default: '—',
    description: 'Called when an item is dragged to a new position.',
  },
  {
    name: 'classes',
    type: 'ListClasses',
    default: '—',
    description: 'Class distribution for root, item, and dragHandle slots.',
  },
  {
    name: 'className',
    type: 'string',
    default: '—',
    description: 'Class for the root <ul> element.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '—',
    description: 'List items, typically rendered via .map().',
  },
];

export const listItemProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ChildValue',
    default: '—',
    description: 'Content of the list item.',
  },
  {
    name: 'className',
    type: 'string',
    default: '—',
    description: 'Additional CSS class.',
  },
];

export const listDragHandleProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ChildValue',
    default: '—',
    description: 'Drag handle content (e.g., a grip icon).',
  },
  {
    name: 'className',
    type: 'string',
    default: '—',
    description: 'Additional CSS class.',
  },
];

export const animateConfigProps: PropDefinition[] = [
  {
    name: 'duration',
    type: 'number',
    default: '200',
    description: 'FLIP animation duration in milliseconds.',
  },
  {
    name: 'easing',
    type: 'string',
    default: "'ease-out'",
    description: 'CSS easing function for FLIP animations.',
  },
];
