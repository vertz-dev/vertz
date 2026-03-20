import type { PropDefinition } from '../types';

export const avatarProps: PropDefinition[] = [
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
    description: 'Avatar content including AvatarImage and AvatarFallback.',
  },
];

export const avatarImageProps: PropDefinition[] = [
  {
    name: 'src',
    type: 'string',
    default: '\u2014',
    description: 'Image source URL.',
  },
  {
    name: 'alt',
    type: 'string',
    default: '\u2014',
    description: 'Alt text for the image.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
