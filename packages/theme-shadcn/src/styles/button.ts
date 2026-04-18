import type { StyleBlock, VariantFunction, VariantsConfig } from '@vertz/ui';
import { token, variants } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

const COLORS_TRANSITION =
  'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)';

const intentVariants: Record<string, StyleBlock> = {
  primary: {
    backgroundColor: token.color.primary,
    color: token.color['primary-foreground'],
    '&:hover': bgOpacity('primary', 80),
  },
  secondary: {
    backgroundColor: token.color.secondary,
    color: token.color['secondary-foreground'],
    '&:hover': bgOpacity('secondary', 80),
  },
  destructive: {
    '&': bgOpacity('destructive', 10),
    color: token.color.destructive,
    '&:hover': bgOpacity('destructive', 20),
    '&:focus-visible': {
      outline: '3px solid color-mix(in oklch, var(--color-destructive) 20%, transparent)',
      borderColor: 'color-mix(in oklch, var(--color-destructive) 40%, transparent)',
    },
    [DARK]: bgOpacity('destructive', 20),
    [`${DARK}:hover`]: bgOpacity('destructive', 30),
  },
  ghost: {
    backgroundColor: 'transparent',
    color: token.color.foreground,
    '&:hover': { backgroundColor: token.color.muted },
    [`${DARK}:hover`]: bgOpacity('muted', 50),
  },
  outline: {
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
    [DARK]: { ...bgOpacity('input', 30), borderColor: token.color.input },
    [`${DARK}:hover`]: bgOpacity('input', 50),
  },
  link: {
    backgroundColor: 'transparent',
    color: token.color.primary,
    '&:hover': { textDecorationLine: 'underline' },
  },
};

const sizeVariants: Record<string, StyleBlock> = {
  xs: {
    height: token.spacing[6],
    gap: token.spacing[1],
    paddingLeft: token.spacing[2],
    paddingRight: token.spacing[2],
    borderRadius: token.radius.md,
  },
  sm: {
    height: token.spacing[7],
    gap: token.spacing[1],
    borderRadius: token.radius.md,
    '&': { paddingLeft: '0.625rem', paddingRight: '0.625rem' },
  },
  md: {
    height: token.spacing[8],
    gap: token.spacing['1.5'],
    '&': { paddingLeft: '0.625rem', paddingRight: '0.625rem' },
  },
  lg: {
    height: token.spacing[9],
    gap: token.spacing['1.5'],
    '&': { paddingLeft: '0.625rem', paddingRight: '0.625rem' },
  },
  icon: { height: token.spacing[8], width: token.spacing[8] },
  'icon-xs': { height: token.spacing[6], width: token.spacing[6], borderRadius: token.radius.md },
  'icon-sm': { height: token.spacing[7], width: token.spacing[7], borderRadius: token.radius.md },
  'icon-lg': { height: token.spacing[9], width: token.spacing[9] },
};

type ButtonVariants = {
  intent: Record<string, StyleBlock>;
  size: Record<string, StyleBlock>;
};

/** Exportable config for variant customization via spread. */
export const buttonConfig: VariantsConfig<ButtonVariants> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    flexShrink: '0',
    gap: token.spacing[2],
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    transition: COLORS_TRANSITION,
    cursor: 'pointer',
    '&': { borderColor: 'transparent' },
    '&:focus-visible': {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
      outlineOffset: '2px',
      borderColor: token.color.ring,
    },
    '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    '& svg': { pointerEvents: 'none', flexShrink: '0' },
  },
  variants: {
    intent: intentVariants,
    size: sizeVariants,
  },
  defaultVariants: {
    intent: 'primary',
    size: 'md',
  },
};

/** Create a button VariantFunction. */
export function createButton(): VariantFunction<ButtonVariants> {
  return variants(buttonConfig);
}
