import type { RawDeclaration, StyleEntry, VariantFunction, VariantsConfig } from '@vertz/ui';
import { variants } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
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
    'shadow:xs',
    { '&:hover': [bgOpacity('primary', 90)] },
  ],
  secondary: [
    'bg:secondary',
    'text:secondary-foreground',
    'shadow:xs',
    { '&:hover': [bgOpacity('secondary', 80)] },
  ],
  destructive: [
    'bg:destructive',
    'text:destructive-foreground',
    'shadow:xs',
    { '&:hover': [bgOpacity('destructive', 90)] },
    { [DARK]: ['text:white'] },
  ],
  ghost: [
    'hover:bg:accent',
    'hover:text:accent-foreground',
    { [`${DARK}:hover`]: [bgOpacity('accent', 50)] },
  ],
  outline: [
    'border:1',
    'border:input',
    'bg:background',
    'shadow:xs',
    'hover:bg:accent',
    'hover:text:accent-foreground',
    { [DARK]: [bgOpacity('input', 30)] },
  ],
  link: ['text:primary', { '&:hover': [{ property: 'text-decoration-line', value: 'underline' }] }],
};

const sizeVariants: Record<string, StyleEntry[]> = {
  xs: ['h:7', 'rounded:md', 'px:2', 'gap:1'],
  sm: ['h:8', 'rounded:md', 'px:3', 'gap:1.5'],
  md: ['h:9', 'px:4', 'py:2'],
  lg: ['h:10', 'rounded:md', 'px:6'],
  icon: ['h:9', 'w:9'],
  'icon-xs': ['h:7', 'w:7'],
  'icon-sm': ['h:8', 'w:8'],
  'icon-lg': ['h:10', 'w:10'],
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
    'rounded:md',
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
