import type { PaletteTokens } from '../types';

/**
 * Neutral palette — shadcn/ui neutral variant.
 * Values use oklch color space matching shadcn/ui v4.
 */
export const neutralTokens: PaletteTokens = {
  background: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.141 0 0)' },
  foreground: { DEFAULT: 'oklch(0.141 0 0)', _dark: 'oklch(0.985 0 0)' },
  card: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.199 0 0)' },
  'card-foreground': { DEFAULT: 'oklch(0.141 0 0)', _dark: 'oklch(0.985 0 0)' },
  popover: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.199 0 0)' },
  'popover-foreground': { DEFAULT: 'oklch(0.141 0 0)', _dark: 'oklch(0.985 0 0)' },
  primary: { DEFAULT: 'oklch(0.205 0 0)', _dark: 'oklch(0.922 0 0)' },
  'primary-foreground': { DEFAULT: 'oklch(0.985 0 0)', _dark: 'oklch(0.205 0 0)' },
  secondary: { DEFAULT: 'oklch(0.97 0 0)', _dark: 'oklch(0.269 0 0)' },
  'secondary-foreground': { DEFAULT: 'oklch(0.205 0 0)', _dark: 'oklch(0.985 0 0)' },
  muted: { DEFAULT: 'oklch(0.97 0 0)', _dark: 'oklch(0.269 0 0)' },
  'muted-foreground': { DEFAULT: 'oklch(0.556 0 0)', _dark: 'oklch(0.708 0 0)' },
  accent: { DEFAULT: 'oklch(0.97 0 0)', _dark: 'oklch(0.269 0 0)' },
  'accent-foreground': { DEFAULT: 'oklch(0.205 0 0)', _dark: 'oklch(0.985 0 0)' },
  destructive: { DEFAULT: 'oklch(0.577 0.245 27.325)', _dark: 'oklch(0.704 0.191 22.216)' },
  'destructive-foreground': { DEFAULT: 'oklch(0.985 0 0)', _dark: 'oklch(0.985 0 0)' },
  border: { DEFAULT: 'oklch(0.922 0 0)', _dark: 'oklch(1 0 0 / 10%)' },
  input: { DEFAULT: 'oklch(0.922 0 0)', _dark: 'oklch(1 0 0 / 15%)' },
  ring: { DEFAULT: 'oklch(0.708 0 0)', _dark: 'oklch(0.556 0 0)' },
};
