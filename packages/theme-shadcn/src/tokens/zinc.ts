import type { PaletteTokens } from '../types';

/**
 * Zinc palette — shadcn/ui default.
 *
 * All tokens use kebab-case keys to match CSS custom property conventions.
 * Contextual tokens use DEFAULT for light mode and _dark for dark mode.
 */
export const zincTokens: PaletteTokens = {
  background: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(240 10% 3.9%)' },
  foreground: { DEFAULT: 'hsl(240 10% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  card: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(240 10% 3.9%)' },
  'card-foreground': { DEFAULT: 'hsl(240 10% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  popover: { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(240 10% 3.9%)' },
  'popover-foreground': { DEFAULT: 'hsl(240 10% 3.9%)', _dark: 'hsl(0 0% 98%)' },
  primary: { DEFAULT: 'hsl(240 5.9% 10%)', _dark: 'hsl(0 0% 98%)' },
  'primary-foreground': { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(240 5.9% 10%)' },
  secondary: { DEFAULT: 'hsl(240 4.8% 95.9%)', _dark: 'hsl(240 3.7% 15.9%)' },
  'secondary-foreground': { DEFAULT: 'hsl(240 5.9% 10%)', _dark: 'hsl(0 0% 98%)' },
  muted: { DEFAULT: 'hsl(240 4.8% 95.9%)', _dark: 'hsl(240 3.7% 15.9%)' },
  'muted-foreground': { DEFAULT: 'hsl(240 3.8% 46.1%)', _dark: 'hsl(240 4.9% 83.9%)' },
  accent: { DEFAULT: 'hsl(240 4.8% 95.9%)', _dark: 'hsl(240 3.7% 15.9%)' },
  'accent-foreground': { DEFAULT: 'hsl(240 5.9% 10%)', _dark: 'hsl(0 0% 98%)' },
  destructive: { DEFAULT: 'hsl(0 84.2% 60.2%)', _dark: 'hsl(0 62.8% 30.6%)' },
  'destructive-foreground': { DEFAULT: 'hsl(0 0% 100%)', _dark: 'hsl(0 0% 98%)' },
  border: { DEFAULT: 'hsl(240 5.9% 90%)', _dark: 'hsl(240 3.7% 15.9%)' },
  input: { DEFAULT: 'hsl(240 5.9% 90%)', _dark: 'hsl(240 3.7% 15.9%)' },
  ring: { DEFAULT: 'hsl(240 10% 3.9%)', _dark: 'hsl(240 4.9% 83.9%)' },
};
