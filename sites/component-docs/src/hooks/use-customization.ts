import type { PaletteName } from '@vertz/theme-shadcn';
import { palettes } from '@vertz/theme-shadcn';
import { palettes as twPalettes } from '@vertz/ui';

// Defined locally to avoid stale built-package imports
export const RADIUS_VALUES: Record<string, string> = {
  none: '0rem',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.625rem',
  xl: '1rem',
};

// ── Types ───────────────────────────────────────────────────
export type AccentName =
  | 'default'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose';

export interface CustomizationState {
  palette: PaletteName;
  radius: string;
  accent: AccentName;
}

// White / near-black constants for foreground contrast
const WHITE = 'oklch(0.985 0 0)';
const BLACK = 'oklch(0.145 0 0)';

// ── Accent color presets ────────────────────────────────────
// Built from the Tailwind v4 oklch palettes in @vertz/ui.
// Light mode uses shade 600 (darker, good contrast on white bg).
// Dark mode uses shade 500 (brighter, good contrast on dark bg).
interface AccentPreset {
  label: string;
  swatch: string;
  tokens: {
    primary: { DEFAULT: string; _dark: string };
    'primary-foreground': { DEFAULT: string; _dark: string };
    ring: { DEFAULT: string; _dark: string };
  };
}

// Helper to build a preset with white-on-color contrast
function accent(label: string, palette: { 500: string; 600: string }): AccentPreset {
  return {
    label,
    swatch: palette[500],
    tokens: {
      primary: { DEFAULT: palette[600], _dark: palette[500] },
      'primary-foreground': { DEFAULT: WHITE, _dark: WHITE },
      ring: { DEFAULT: palette[600], _dark: palette[500] },
    },
  };
}

// Helper for lighter colors that need dark foreground text
function accentLight(label: string, palette: { 400: string; 500: string }): AccentPreset {
  return {
    label,
    swatch: palette[500],
    tokens: {
      primary: { DEFAULT: palette[500], _dark: palette[400] },
      'primary-foreground': { DEFAULT: BLACK, _dark: BLACK },
      ring: { DEFAULT: palette[500], _dark: palette[400] },
    },
  };
}

export const ACCENT_PRESETS: Record<Exclude<AccentName, 'default'>, AccentPreset> = {
  red: accent('Red', twPalettes.red),
  orange: accent('Orange', twPalettes.orange),
  amber: accentLight('Amber', twPalettes.amber),
  yellow: accentLight('Yellow', twPalettes.yellow),
  lime: accentLight('Lime', twPalettes.lime),
  green: accent('Green', twPalettes.green),
  emerald: accent('Emerald', twPalettes.emerald),
  teal: accent('Teal', twPalettes.teal),
  cyan: accent('Cyan', twPalettes.cyan),
  sky: accent('Sky', twPalettes.sky),
  blue: accent('Blue', twPalettes.blue),
  indigo: accent('Indigo', twPalettes.indigo),
  violet: accent('Violet', twPalettes.violet),
  purple: accent('Purple', twPalettes.purple),
  fuchsia: accent('Fuchsia', twPalettes.fuchsia),
  pink: accent('Pink', twPalettes.pink),
  rose: accent('Rose', twPalettes.rose),
};

// ── Module-level state for theme toggle sync ────────────────
// The App's toggle() calls reapplyCustomization() after switching mode
// so the customizer's overrides stay correct for the new light/dark mode.
let _currentState: CustomizationState = { palette: 'zinc', radius: 'md', accent: 'default' };

export function setModuleState(state: CustomizationState): void {
  _currentState = state;
}

export function reapplyCustomization(mode: 'dark' | 'light'): void {
  if (_currentState.palette !== 'zinc') {
    applyPalette(_currentState.palette, mode);
  }
  if (_currentState.accent !== 'default') {
    applyAccent(_currentState.accent, mode);
  }
}

// ── Cookie persistence ──────────────────────────────────────
const COOKIE_KEY = 'vertz-customization';

export function getCustomizationCookie(): CustomizationState | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]+)`));
  if (!match) return null;
  try {
    const parts = match[1].split(',');
    const [palette, radius, accent] = parts;
    const validPalettes: PaletteName[] = ['zinc', 'slate', 'stone', 'neutral', 'gray'];
    const validRadii = Object.keys(RADIUS_VALUES);
    const validAccents: AccentName[] = [
      'default',
      'red',
      'orange',
      'amber',
      'yellow',
      'lime',
      'green',
      'emerald',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ];
    if (validPalettes.includes(palette as PaletteName) && validRadii.includes(radius)) {
      return {
        palette: palette as PaletteName,
        radius,
        accent: validAccents.includes(accent as AccentName) ? (accent as AccentName) : 'default',
      };
    }
  } catch {
    // Invalid cookie value
  }
  return null;
}

export function setCustomizationCookie(state: CustomizationState): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY}=${state.palette},${state.radius},${state.accent};path=/;max-age=31536000;SameSite=Lax`;
}

export function clearCustomizationCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY}=;path=/;max-age=0;SameSite=Lax`;
}

// ── CSS variable application ────────────────────────────────
function getThemeTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  // Target the ThemeProvider's <div data-theme>, not <html data-theme>.
  // The div is the closest ancestor to all components, so inline overrides
  // take precedence over the stylesheet rules on the same element.
  return document.querySelector('div[data-theme]') as HTMLElement | null;
}

export function applyPalette(paletteName: PaletteName, mode: 'dark' | 'light'): void {
  const target = getThemeTarget();
  if (!target) return;
  const tokens = palettes[paletteName];
  for (const [name, variants] of Object.entries(tokens)) {
    const value = mode === 'dark' && variants._dark ? variants._dark : variants.DEFAULT;
    target.style.setProperty(`--color-${name}`, value);
  }
  // Also apply to <html> so body's background-color (which inherits from html,
  // not from the theme div) picks up the overridden --color-background.
  const root = document.documentElement;
  for (const [name, variants] of Object.entries(tokens)) {
    const value = mode === 'dark' && variants._dark ? variants._dark : variants.DEFAULT;
    root.style.setProperty(`--color-${name}`, value);
  }
}

export function applyAccent(accent: AccentName, mode: 'dark' | 'light'): void {
  const target = getThemeTarget();
  if (!target) return;
  if (accent === 'default') {
    // Remove accent overrides — palette values (or defaults) take over
    target.style.removeProperty('--color-primary');
    target.style.removeProperty('--color-primary-foreground');
    target.style.removeProperty('--color-ring');
    return;
  }
  const preset = ACCENT_PRESETS[accent];
  for (const [name, variants] of Object.entries(preset.tokens)) {
    const value = mode === 'dark' ? variants._dark : variants.DEFAULT;
    target.style.setProperty(`--color-${name}`, value);
  }
}

export function applyRadius(radius: CustomizationState['radius']): void {
  const target = getThemeTarget();
  if (!target) return;
  target.style.setProperty('--radius', RADIUS_VALUES[radius]);
  // Also apply to <html> so global styles pick it up
  document.documentElement.style.setProperty('--radius', RADIUS_VALUES[radius]);
}

export function clearOverrides(): void {
  const target = getThemeTarget();
  if (!target) return;
  for (const name of Object.keys(palettes.zinc)) {
    target.style.removeProperty(`--color-${name}`);
  }
  target.style.removeProperty('--radius');
  // Clear from <html> too (palette and radius apply to both)
  const root = document.documentElement;
  for (const name of Object.keys(palettes.zinc)) {
    root.style.removeProperty(`--color-${name}`);
  }
  root.style.removeProperty('--radius');
}

// ── Config export ───────────────────────────────────────────
export function generateConfig(state: CustomizationState): string {
  const configParts: string[] = [];
  if (state.palette !== 'zinc') configParts.push(`  palette: '${state.palette}',`);
  if (state.radius !== 'md') configParts.push(`  radius: '${state.radius}',`);

  // Build colors block for accent overrides
  if (state.accent !== 'default') {
    const preset = ACCENT_PRESETS[state.accent];
    const colorLines: string[] = [];
    colorLines.push('  colors: {');
    for (const [name, variants] of Object.entries(preset.tokens)) {
      colorLines.push(
        `    '${name}': { DEFAULT: '${variants.DEFAULT}', _dark: '${variants._dark}' },`,
      );
    }
    colorLines.push('  },');
    configParts.push(...colorLines);
  }

  const configArg = configParts.length > 0 ? `{\n${configParts.join('\n')}\n}` : '';

  const lines = [
    "import { configureTheme } from '@vertz/theme-shadcn';",
    "import { registerTheme } from '@vertz/ui';",
    '',
    `const config = configureTheme(${configArg});`,
    'registerTheme(config);',
  ];

  return lines.join('\n');
}
