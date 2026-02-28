import type { RawDeclaration, StyleEntry, VariantFunction, VariantsConfig } from '@vertz/ui';
import { variants } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    'border:ring',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
  ],
};

const disabledStyles: Record<string, (string | RawDeclaration)[]> = {
  '&:disabled': ['pointer-events-none', 'opacity:0.5'],
};

const svgStyles: Record<string, (string | RawDeclaration)[]> = {
  '& svg': ['pointer-events-none', 'shrink-0'],
};

const intentVariants: Record<string, StyleEntry[]> = {
  primary: [
    'bg:primary',
    'text:primary-foreground',
    { '&:hover': [bgOpacity('primary', 80)] },
  ],
  secondary: [
    'bg:secondary',
    'text:secondary-foreground',
    { '&:hover': [bgOpacity('secondary', 80)] },
  ],
  destructive: [
    { '&': [bgOpacity('destructive', 10)] },
    'text:destructive',
    { '&:hover': [bgOpacity('destructive', 20)] },
    {
      '&:focus-visible': [
        {
          property: 'outline',
          value: '3px solid color-mix(in oklch, var(--color-destructive) 20%, transparent)',
        },
        { property: 'border-color', value: 'color-mix(in oklch, var(--color-destructive) 40%, transparent)' },
      ],
    },
    { [DARK]: [bgOpacity('destructive', 20)] },
    { [`${DARK}:hover`]: [bgOpacity('destructive', 30)] },
  ],
  ghost: [
    { '&:hover': ['bg:muted', 'text:foreground'] },
    { [`${DARK}:hover`]: [bgOpacity('muted', 50)] },
  ],
  outline: [
    'border:border',
    'bg:background',
    { '&:hover': ['bg:muted', 'text:foreground'] },
    { [DARK]: [bgOpacity('input', 30), 'border:input'] },
    { [`${DARK}:hover`]: [bgOpacity('input', 50)] },
  ],
  link: ['text:primary', { '&:hover': [{ property: 'text-decoration-line', value: 'underline' }] }],
};

const sizeVariants: Record<string, StyleEntry[]> = {
  xs: ['h:6', 'gap:1', 'px:2', { '&': [{ property: 'border-radius', value: 'min(var(--radius-md), 10px)' }] }],
  sm: ['h:7', 'gap:1', { '&': [{ property: 'border-radius', value: 'min(var(--radius-md), 12px)' }, { property: 'padding-left', value: '0.625rem' }, { property: 'padding-right', value: '0.625rem' }] }],
  md: ['h:8', 'gap:1.5', { '&': [{ property: 'padding-left', value: '0.625rem' }, { property: 'padding-right', value: '0.625rem' }] }],
  lg: ['h:9', 'gap:1.5', { '&': [{ property: 'padding-left', value: '0.625rem' }, { property: 'padding-right', value: '0.625rem' }] }],
  icon: ['h:8', 'w:8'],
  'icon-xs': ['h:6', 'w:6', { '&': [{ property: 'border-radius', value: 'min(var(--radius-md), 10px)' }] }],
  'icon-sm': ['h:7', 'w:7', { '&': [{ property: 'border-radius', value: 'min(var(--radius-md), 12px)' }] }],
  'icon-lg': ['h:9', 'w:9'],
};

type ButtonVariants = {
  intent: Record<string, StyleEntry[]>;
  size: Record<string, StyleEntry[]>;
};

/** Exportable config for variant customization via spread. */
export const buttonConfig: VariantsConfig<ButtonVariants> = {
  base: [
    'inline-flex',
    'items:center',
    'justify:center',
    'whitespace-nowrap',
    'shrink-0',
    'gap:2',
    'rounded:lg',
    'border:1',
    { '&': [{ property: 'border-color', value: 'transparent' }] },
    'text:sm',
    'font:medium',
    'transition:colors',
    'cursor:pointer',
    focusRing,
    disabledStyles,
    svgStyles,
  ],
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
