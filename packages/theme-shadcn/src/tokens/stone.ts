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
  'chart-1': { DEFAULT: 'oklch(0.646 0.222 41.116)', _dark: 'oklch(0.488 0.243 264.376)' },
  'chart-2': { DEFAULT: 'oklch(0.6 0.118 184.714)', _dark: 'oklch(0.696 0.17 162.48)' },
  'chart-3': { DEFAULT: 'oklch(0.398 0.07 227.392)', _dark: 'oklch(0.769 0.188 70.08)' },
  'chart-4': { DEFAULT: 'oklch(0.828 0.189 84.429)', _dark: 'oklch(0.627 0.265 303.9)' },
  'chart-5': { DEFAULT: 'oklch(0.769 0.188 70.08)', _dark: 'oklch(0.645 0.246 16.439)' },
  sidebar: {
    DEFAULT: 'oklch(0.985 0.001 106.424)',
    _dark: 'oklch(0.216 0.006 56.043)',
  },
  'sidebar-foreground': {
    DEFAULT: 'oklch(0.147 0.004 49.25)',
    _dark: 'oklch(0.985 0.001 106.424)',
  },
  'sidebar-primary': {
    DEFAULT: 'oklch(0.216 0.006 56.043)',
    _dark: 'oklch(0.488 0.243 264.376)',
  },
  'sidebar-primary-foreground': {
    DEFAULT: 'oklch(0.985 0.001 106.424)',
    _dark: 'oklch(0.985 0.001 106.424)',
  },
  'sidebar-accent': {
    DEFAULT: 'oklch(0.97 0.001 106.424)',
    _dark: 'oklch(0.268 0.007 34.298)',
  },
  'sidebar-accent-foreground': {
    DEFAULT: 'oklch(0.216 0.006 56.043)',
    _dark: 'oklch(0.985 0.001 106.424)',
  },
  'sidebar-border': {
    DEFAULT: 'oklch(0.923 0.003 48.717)',
    _dark: 'oklch(1 0 0 / 10%)',
  },
  'sidebar-ring': {
    DEFAULT: 'oklch(0.709 0.01 56.259)',
    _dark: 'oklch(0.553 0.013 58.071)',
  },
};
