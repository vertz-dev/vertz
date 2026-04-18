import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

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
    avatarRoot: {
      position: 'relative',
      display: 'flex',
      height: token.spacing[8],
      width: token.spacing[8],
      flexShrink: '0',
      overflow: 'hidden',
      borderRadius: token.radius.full,
    },
    avatarImage: {
      height: '100%',
      width: '100%',
      '&': { aspectRatio: '1 / 1', objectFit: 'cover' },
    },
    avatarFallback: {
      display: 'flex',
      height: '100%',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.full,
      backgroundColor: token.color.muted,
      color: token.color['muted-foreground'],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.medium,
    },
    avatarRootSm: { height: token.spacing[6], width: token.spacing[6] },
    avatarRootLg: { height: token.spacing[10], width: token.spacing[10] },
    avatarRootXl: { height: token.spacing[12], width: token.spacing[12] },
    avatarFallbackSm: [{ '&': { 'font-size': '0.625rem' } }],
    avatarFallbackLg: { fontSize: token.font.size.sm },
    avatarFallbackXl: { fontSize: token.font.size.base },
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
