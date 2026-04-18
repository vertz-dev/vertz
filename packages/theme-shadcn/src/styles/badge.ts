import type { StyleBlock, VariantFunction, VariantsConfig } from '@vertz/ui';
import { token, variants } from '@vertz/ui';
import { bgOpacity } from './_helpers';

const colorVariants: Record<string, StyleBlock> = {
  blue: { backgroundColor: token.color.primary, color: token.color['primary-foreground'] },
  green: { backgroundColor: token.color.primary, color: token.color['primary-foreground'] },
  yellow: { backgroundColor: token.color.secondary, color: token.color['secondary-foreground'] },
  red: { '&': bgOpacity('destructive', 10), color: token.color.destructive },
  gray: { backgroundColor: token.color.muted, color: token.color['muted-foreground'] },
};

type BadgeVariants = {
  color: Record<string, StyleBlock>;
};

/** Exportable config for variant customization via spread. */
export const badgeConfig: VariantsConfig<BadgeVariants> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: token.radius.full,
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    paddingLeft: token.spacing[2],
    paddingRight: token.spacing[2],
    paddingTop: token.spacing['0.5'],
    paddingBottom: token.spacing['0.5'],
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    borderWidth: '1px',
    borderColor: 'transparent',
    whiteSpace: 'nowrap',
    flexShrink: '0',
    '&': { height: '1.25rem' },
  },
  variants: {
    color: colorVariants,
  },
  defaultVariants: {
    color: 'gray',
  },
};

/** Create a badge VariantFunction. */
export function createBadge(): VariantFunction<BadgeVariants> {
  return variants(badgeConfig);
}
