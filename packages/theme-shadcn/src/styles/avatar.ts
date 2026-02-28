import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type AvatarBlocks = {
  root: StyleEntry[];
  image: StyleEntry[];
  fallback: StyleEntry[];
  rootSm: StyleEntry[];
  rootLg: StyleEntry[];
  rootXl: StyleEntry[];
  fallbackSm: StyleEntry[];
  fallbackLg: StyleEntry[];
  fallbackXl: StyleEntry[];
};

/** Create avatar css() styles. */
export function createAvatarStyles(): CSSOutput<AvatarBlocks> {
  const s = css({
    avatarRoot: ['relative', 'flex', 'h:8', 'w:8', 'shrink-0', 'overflow-hidden', 'rounded:full'],
    avatarImage: [
      'h:full',
      'w:full',
      {
        '&': [
          { property: 'aspect-ratio', value: '1 / 1' },
          { property: 'object-fit', value: 'cover' },
        ],
      },
    ],
    avatarFallback: [
      'flex',
      'h:full',
      'w:full',
      'items:center',
      'justify:center',
      'rounded:full',
      'bg:muted',
      'text:muted-foreground',
      'text:xs',
      'font:medium',
    ],
    avatarRootSm: ['h:6', 'w:6'],
    avatarRootLg: ['h:10', 'w:10'],
    avatarRootXl: ['h:12', 'w:12'],
    avatarFallbackSm: [{ '&': [{ property: 'font-size', value: '0.625rem' }] }],
    avatarFallbackLg: ['text:sm'],
    avatarFallbackXl: ['text:base'],
  });
  return {
    root: s.avatarRoot,
    image: s.avatarImage,
    fallback: s.avatarFallback,
    rootSm: s.avatarRootSm,
    rootLg: s.avatarRootLg,
    rootXl: s.avatarRootXl,
    fallbackSm: s.avatarFallbackSm,
    fallbackLg: s.avatarFallbackLg,
    fallbackXl: s.avatarFallbackXl,
    css: s.css,
  } as CSSOutput<AvatarBlocks>;
}
