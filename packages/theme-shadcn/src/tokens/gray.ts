import type { PaletteTokens } from '../types';

/**
 * Gray palette — shadcn/ui gray variant.
 */
export const grayTokens: PaletteTokens = {
  background: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(224 71.4% 4.1%)' },
  foreground: { DEFAULT: 'hsl(224 71.4% 4.1%)', _dark: 'hsl(210 20% 98%)' },
  card: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(224 71.4% 4.1%)' },
  'card-foreground': { DEFAULT: 'hsl(224 71.4% 4.1%)', _dark: 'hsl(210 20% 98%)' },
  popover: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(224 71.4% 4.1%)' },
  'popover-foreground': { DEFAULT: 'hsl(224 71.4% 4.1%)', _dark: 'hsl(210 20% 98%)' },
  primary: { DEFAULT: 'hsl(220.9 39.3% 11%)', _dark: 'hsl(210 20% 98%)' },
  'primary-foreground': { DEFAULT: 'hsl(210 20% 98%)', _dark: 'hsl(220.9 39.3% 11%)' },
  secondary: { DEFAULT: 'hsl(220 14.3% 95.9%)', _dark: 'hsl(215 27.9% 16.9%)' },
  'secondary-foreground': { DEFAULT: 'hsl(220.9 39.3% 11%)', _dark: 'hsl(210 20% 98%)' },
  muted: { DEFAULT: 'hsl(220 14.3% 95.9%)', _dark: 'hsl(215 27.9% 16.9%)' },
  'muted-foreground': { DEFAULT: 'hsl(220 8.9% 46.1%)', _dark: 'hsl(217.9 10.6% 64.9%)' },
  accent: { DEFAULT: 'hsl(220 14.3% 95.9%)', _dark: 'hsl(215 27.9% 16.9%)' },
  'accent-foreground': { DEFAULT: 'hsl(220.9 39.3% 11%)', _dark: 'hsl(210 20% 98%)' },
  destructive: { DEFAULT: 'hsl(0 84.2% 60.2%)', _dark: 'hsl(0 62.8% 30.6%)' },
  'destructive-foreground': { DEFAULT: 'hsl(210 20% 98%)', _dark: 'hsl(210 20% 98%)' },
  border: { DEFAULT: 'hsl(220 13% 91%)', _dark: 'hsl(215 27.9% 16.9%)' },
  input: { DEFAULT: 'hsl(220 13% 91%)', _dark: 'hsl(215 27.9% 16.9%)' },
  ring: { DEFAULT: 'hsl(224 71.4% 4.1%)', _dark: 'hsl(216 12.2% 83.9%)' },
};
