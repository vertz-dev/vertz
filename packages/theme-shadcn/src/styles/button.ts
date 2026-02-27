import type { VariantFunction, VariantsConfig } from '@vertz/ui';
import { variants } from '@vertz/ui';

const intentVariants: Record<string, string[]> = {
  primary: ['bg:primary', 'text:primary-foreground', 'hover:opacity:0.9'],
  secondary: ['bg:secondary', 'text:secondary-foreground', 'hover:opacity:0.9'],
  destructive: ['bg:destructive', 'text:destructive-foreground', 'hover:opacity:0.9'],
  ghost: ['hover:bg:accent', 'hover:text:accent-foreground'],
  outline: [
    'border:1',
    'border:input',
    'bg:background',
    'hover:bg:accent',
    'hover:text:accent-foreground',
  ],
};

const sizeVariants: Record<string, string[]> = {
  sm: ['h:9', 'rounded:md', 'px:3'],
  md: ['h:10', 'px:4', 'py:2'],
  lg: ['h:11', 'rounded:md', 'px:8'],
  icon: ['h:10', 'w:10'],
};

type ButtonVariants = {
  intent: Record<string, string[]>;
  size: Record<string, string[]>;
};

/** Exportable config for variant customization via spread. */
export const buttonConfig: VariantsConfig<ButtonVariants> = {
  base: [
    'inline-flex',
    'items:center',
    'justify:center',
    'gap:2',
    'rounded:md',
    'text:sm',
    'font:medium',
    'transition:colors',
    'cursor:pointer',
    'focus-visible:outline-none',
    'focus-visible:ring:2',
    'focus-visible:ring:ring',
    'disabled:opacity:0.5',
    'disabled:cursor:default',
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
