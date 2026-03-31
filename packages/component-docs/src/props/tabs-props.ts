import type { PropDefinition } from '../types';

export const tabsProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'string',
    default: '\u2014',
    description: 'Value of the initially active tab.',
  },
  {
    name: 'variant',
    type: '"default" | "line"',
    default: '"default"',
    description: 'Styling variant for the tab list.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Tabs content including List, Trigger, and Content sub-components.',
  },
];

export const tabsTriggerProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value that identifies this tab. Must match a Tabs.Content value.',
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
    description: 'Tab label content.',
  },
];

export const tabsContentProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value that identifies this panel. Must match a Tabs.Trigger value.',
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
