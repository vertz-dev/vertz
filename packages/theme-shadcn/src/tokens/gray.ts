import type { PaletteTokens } from '../types';

/**
 * Gray palette — shadcn/ui gray variant.
 * Values use oklch color space matching shadcn/ui v4.
 */
export const grayTokens: PaletteTokens = {
  background: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.13 0.028 261.692)' },
  foreground: { DEFAULT: 'oklch(0.13 0.028 261.692)', _dark: 'oklch(0.984 0.003 247.858)' },
  card: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.188 0.028 261.692)' },
  'card-foreground': {
    DEFAULT: 'oklch(0.13 0.028 261.692)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  popover: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.188 0.028 261.692)' },
  'popover-foreground': {
    DEFAULT: 'oklch(0.13 0.028 261.692)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  primary: { DEFAULT: 'oklch(0.21 0.034 264.665)', _dark: 'oklch(0.984 0.003 247.858)' },
  'primary-foreground': {
    DEFAULT: 'oklch(0.984 0.003 247.858)',
    _dark: 'oklch(0.21 0.034 264.665)',
  },
  secondary: { DEFAULT: 'oklch(0.967 0.003 264.542)', _dark: 'oklch(0.268 0.025 264.052)' },
  'secondary-foreground': {
    DEFAULT: 'oklch(0.21 0.034 264.665)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  muted: { DEFAULT: 'oklch(0.967 0.003 264.542)', _dark: 'oklch(0.268 0.025 264.052)' },
  'muted-foreground': {
    DEFAULT: 'oklch(0.554 0.014 264.364)',
    _dark: 'oklch(0.715 0.014 264.434)',
  },
  accent: { DEFAULT: 'oklch(0.967 0.003 264.542)', _dark: 'oklch(0.268 0.025 264.052)' },
  'accent-foreground': {
    DEFAULT: 'oklch(0.21 0.034 264.665)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  destructive: { DEFAULT: 'oklch(0.577 0.245 27.325)', _dark: 'oklch(0.704 0.191 22.216)' },
  'destructive-foreground': {
    DEFAULT: 'oklch(0.984 0.003 247.858)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  border: { DEFAULT: 'oklch(0.928 0.006 264.531)', _dark: 'oklch(1 0 0 / 10%)' },
  input: { DEFAULT: 'oklch(0.928 0.006 264.531)', _dark: 'oklch(1 0 0 / 15%)' },
  ring: { DEFAULT: 'oklch(0.708 0.014 264.434)', _dark: 'oklch(0.556 0.014 264.434)' },
};
