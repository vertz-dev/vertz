import type { StyleEntry, VariantFunction, VariantsConfig } from '@vertz/ui';
import { variants } from '@vertz/ui';

const colorVariants: Record<string, StyleEntry[]> = {
  blue: ['bg:primary', 'text:primary-foreground'],
  green: ['bg:accent', 'text:accent-foreground'],
  yellow: ['bg:secondary', 'text:secondary-foreground'],
  red: ['bg:destructive', 'text:destructive-foreground'],
  gray: ['bg:muted', 'text:muted-foreground'],
};

type BadgeVariants = {
  color: Record<string, StyleEntry[]>;
};

/** Exportable config for variant customization via spread. */
export const badgeConfig: VariantsConfig<BadgeVariants> = {
  base: [
    'inline-flex',
    'items:center',
    'rounded:full',
    'text:xs',
    'font:medium',
    'px:2.5',
    'py:0.5',
    'transition:colors',
    'border:1',
    'border:transparent',
    'whitespace-nowrap',
    'shrink-0',
  ],
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
