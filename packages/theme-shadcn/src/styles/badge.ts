import type { StyleEntry, VariantFunction, VariantsConfig } from '@vertz/ui';
import { variants } from '@vertz/ui';
import { bgOpacity } from './_helpers';

const colorVariants: Record<string, StyleEntry[]> = {
  blue: ['bg:primary', 'text:primary-foreground'],
  green: ['bg:primary', 'text:primary-foreground'],
  yellow: ['bg:secondary', 'text:secondary-foreground'],
  red: [{ '&': [bgOpacity('destructive', 10)] }, 'text:destructive'],
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
    'px:2',
    'py:0.5',
    'transition:all',
    'border:1',
    'border:transparent',
    'whitespace-nowrap',
    'shrink-0',
    { '&': [{ property: 'height', value: '1.25rem' }] },
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
