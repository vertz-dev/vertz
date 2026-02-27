import type { PaletteTokens } from '../types';

/**
 * Stone palette — shadcn/ui stone variant.
 * Values use oklch color space matching shadcn/ui v4.
 */
export const stoneTokens: PaletteTokens = {
  background: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.147 0.004 49.25)' },
  foreground: { DEFAULT: 'oklch(0.147 0.004 49.25)', _dark: 'oklch(0.985 0.001 106.423)' },
  card: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.208 0.004 56.043)' },
  'card-foreground': {
    DEFAULT: 'oklch(0.147 0.004 49.25)',
    _dark: 'oklch(0.985 0.001 106.423)',
  },
  popover: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.208 0.004 56.043)' },
  'popover-foreground': {
    DEFAULT: 'oklch(0.147 0.004 49.25)',
    _dark: 'oklch(0.985 0.001 106.423)',
  },
  primary: { DEFAULT: 'oklch(0.216 0.006 56.043)', _dark: 'oklch(0.985 0.001 106.423)' },
  'primary-foreground': {
    DEFAULT: 'oklch(0.985 0.001 106.423)',
    _dark: 'oklch(0.216 0.006 56.043)',
  },
  secondary: { DEFAULT: 'oklch(0.97 0.001 106.424)', _dark: 'oklch(0.268 0.005 56.366)' },
  'secondary-foreground': {
    DEFAULT: 'oklch(0.216 0.006 56.043)',
    _dark: 'oklch(0.985 0.001 106.423)',
  },
  muted: { DEFAULT: 'oklch(0.97 0.001 106.424)', _dark: 'oklch(0.268 0.005 56.366)' },
  'muted-foreground': {
    DEFAULT: 'oklch(0.553 0.013 58.071)',
    _dark: 'oklch(0.709 0.01 56.259)',
  },
  accent: { DEFAULT: 'oklch(0.97 0.001 106.424)', _dark: 'oklch(0.268 0.005 56.366)' },
  'accent-foreground': {
    DEFAULT: 'oklch(0.216 0.006 56.043)',
    _dark: 'oklch(0.985 0.001 106.423)',
  },
  destructive: { DEFAULT: 'oklch(0.577 0.245 27.325)', _dark: 'oklch(0.704 0.191 22.216)' },
  'destructive-foreground': {
    DEFAULT: 'oklch(0.985 0.001 106.423)',
    _dark: 'oklch(0.985 0.001 106.423)',
  },
  border: { DEFAULT: 'oklch(0.923 0.003 48.717)', _dark: 'oklch(1 0 0 / 10%)' },
  input: { DEFAULT: 'oklch(0.923 0.003 48.717)', _dark: 'oklch(1 0 0 / 15%)' },
  ring: { DEFAULT: 'oklch(0.709 0.01 56.259)', _dark: 'oklch(0.553 0.013 58.071)' },
};
