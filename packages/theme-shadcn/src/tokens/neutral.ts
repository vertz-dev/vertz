import type { PaletteTokens } from '../types';

/**
 * Neutral palette — shadcn/ui neutral variant.
 */
export const neutralTokens: PaletteTokens = {
  background: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(0 0% 3.9%)' },
  foreground: { DEFAULT: 'hsl(0 0% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  card: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(0 0% 3.9%)' },
  'card-foreground': { DEFAULT: 'hsl(0 0% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  popover: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(0 0% 3.9%)' },
  'popover-foreground': { DEFAULT: 'hsl(0 0% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  primary: { DEFAULT: 'hsl(0 0% 9%)', _dark: 'hsl(0 0% 98%)' },
  'primary-foreground': { DEFAULT: 'hsl(0 0% 98%)', _dark: 'hsl(0 0% 9%)' },
  secondary: { DEFAULT: 'hsl(0 0% 96.1%)', _dark: 'hsl(0 0% 14.9%)' },
  'secondary-foreground': { DEFAULT: 'hsl(0 0% 9%)', _dark: 'hsl(0 0% 98%)' },
  muted: { DEFAULT: 'hsl(0 0% 96.1%)', _dark: 'hsl(0 0% 14.9%)' },
  'muted-foreground': { DEFAULT: 'hsl(0 0% 45.1%)', _dark: 'hsl(0 0% 63.9%)' },
  accent: { DEFAULT: 'hsl(0 0% 96.1%)', _dark: 'hsl(0 0% 14.9%)' },
  'accent-foreground': { DEFAULT: 'hsl(0 0% 9%)', _dark: 'hsl(0 0% 98%)' },
  destructive: { DEFAULT: 'hsl(0 84.2% 60.2%)', _dark: 'hsl(0 62.8% 30.6%)' },
  'destructive-foreground': { DEFAULT: 'hsl(0 0% 98%)', _dark: 'hsl(0 0% 98%)' },
  border: { DEFAULT: 'hsl(0 0% 89.8%)', _dark: 'hsl(0 0% 14.9%)' },
  input: { DEFAULT: 'hsl(0 0% 89.8%)', _dark: 'hsl(0 0% 14.9%)' },
  ring: { DEFAULT: 'hsl(0 0% 3.9%)', _dark: 'hsl(0 0% 83.1%)' },
};
