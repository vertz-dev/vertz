import type { PaletteTokens } from '../types';

/**
 * Slate palette — shadcn/ui slate variant.
 * Values use oklch color space matching shadcn/ui v4.
 */
export const slateTokens: PaletteTokens = {
  background: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.129 0.042 264.695)' },
  foreground: { DEFAULT: 'oklch(0.129 0.042 264.695)', _dark: 'oklch(0.984 0.003 247.858)' },
  card: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.188 0.035 264.376)' },
  'card-foreground': {
    DEFAULT: 'oklch(0.129 0.042 264.695)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  popover: { DEFAULT: 'oklch(1 0 0)', _dark: 'oklch(0.188 0.035 264.376)' },
  'popover-foreground': {
    DEFAULT: 'oklch(0.129 0.042 264.695)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  primary: { DEFAULT: 'oklch(0.208 0.042 265.755)', _dark: 'oklch(0.984 0.003 247.858)' },
  'primary-foreground': {
    DEFAULT: 'oklch(0.984 0.003 247.858)',
    _dark: 'oklch(0.208 0.042 265.755)',
  },
  secondary: { DEFAULT: 'oklch(0.968 0.003 264.542)', _dark: 'oklch(0.268 0.032 264.052)' },
  'secondary-foreground': {
    DEFAULT: 'oklch(0.208 0.042 265.755)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  muted: { DEFAULT: 'oklch(0.968 0.003 264.542)', _dark: 'oklch(0.268 0.032 264.052)' },
  'muted-foreground': {
    DEFAULT: 'oklch(0.554 0.023 264.364)',
    _dark: 'oklch(0.716 0.02 264.434)',
  },
  accent: { DEFAULT: 'oklch(0.968 0.003 264.542)', _dark: 'oklch(0.268 0.032 264.052)' },
  'accent-foreground': {
    DEFAULT: 'oklch(0.208 0.042 265.755)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  destructive: { DEFAULT: 'oklch(0.577 0.245 27.325)', _dark: 'oklch(0.704 0.191 22.216)' },
  'destructive-foreground': {
    DEFAULT: 'oklch(0.984 0.003 247.858)',
    _dark: 'oklch(0.984 0.003 247.858)',
  },
  border: { DEFAULT: 'oklch(0.929 0.005 264.531)', _dark: 'oklch(1 0 0 / 10%)' },
  input: { DEFAULT: 'oklch(0.929 0.005 264.531)', _dark: 'oklch(1 0 0 / 15%)' },
  ring: { DEFAULT: 'oklch(0.708 0.02 264.434)', _dark: 'oklch(0.556 0.02 264.434)' },
};
