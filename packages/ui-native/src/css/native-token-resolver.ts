/**
 * Native token resolver for @vertz/ui-native.
 *
 * Resolves Vertz CSS tokens (e.g., 'p:4', 'bg:primary.600', 'rounded:lg')
 * to concrete native values (pixels, RGBA arrays) that the GPU renderer
 * can use directly. No CSS custom properties — everything is baked.
 */

// ─── Types ──────────────────────────────────────────────────────

/** RGBA color as [r, g, b, a] with values 0..1. */
export type RGBA = [number, number, number, number];

/** Resolved native style properties. */
export type NativeStyleMap = Record<string, number | number[] | string>;

/** Theme color map: namespace → shade → RGBA. Use 'DEFAULT' for base. */
export interface NativeTheme {
  colors: Record<string, Record<string, RGBA>>;
  baseFontSize: number;
}

export interface NativeTokenResolver {
  resolve(property: string, value: string): NativeStyleMap;
}

// ─── Scales (mirrored from @vertz/ui token-tables, converted to pixels) ──

const SPACING_SCALE: Record<string, number> = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '11': 44,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
  '24': 96,
  '28': 112,
  '32': 128,
  '36': 144,
  '40': 160,
  '44': 176,
  '48': 192,
  '52': 208,
  '56': 224,
  '60': 240,
  '64': 256,
  '72': 288,
  '80': 320,
  '96': 384,
};

const RADIUS_SCALE: Record<string, number> = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
};

const FONT_SIZE_SCALE: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
};

const FONT_WEIGHT_SCALE: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

// ─── Spacing property mappings ──────────────────────────────────

const SPACING_PROPS: Record<string, string[]> = {
  p: ['padding'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
  pt: ['paddingTop'],
  pr: ['paddingRight'],
  pb: ['paddingBottom'],
  pl: ['paddingLeft'],
  m: ['margin'],
  mx: ['marginLeft', 'marginRight'],
  my: ['marginTop', 'marginBottom'],
  mt: ['marginTop'],
  mr: ['marginRight'],
  mb: ['marginBottom'],
  ml: ['marginLeft'],
  gap: ['gap'],
};

// ─── Color parsing ──────────────────────────────────────────────

function parseHexColor(hex: string): RGBA {
  if (hex === 'transparent') return [0, 0, 0, 0];
  if (hex === 'white') return [1, 1, 1, 1];
  if (hex === 'black') return [0, 0, 0, 1];

  if (!hex.startsWith('#')) return [0, 0, 0, 1];
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const a = hex.length > 7 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return [r, g, b, a];
}

/**
 * Convert oklch(L C H) string to sRGB RGBA.
 * L: 0..1 lightness, C: 0..0.4 chroma, H: 0..360 hue.
 */
export function oklchToRgba(oklchStr: string): RGBA {
  const match = oklchStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return [0, 0, 0, 1];

  const L = Number(match[1]);
  const C = Number(match[2]);
  const H = Number(match[3]);

  // OKLCh → OKLab
  const hRad = (H * Math.PI) / 180;
  const a_ = C * Math.cos(hRad);
  const b_ = C * Math.sin(hRad);

  // OKLab → linear sRGB (via LMS)
  const l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_;
  const m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_;
  const s_ = L - 0.0894841775 * a_ - 1.291485548 * b_;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Clamp to [0, 1]
  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)), 1];
}

// ─── Default dark theme (zinc-based, similar to shadcn dark) ────

export const defaultDarkTheme: NativeTheme = {
  colors: {
    background: { DEFAULT: oklchToRgba('oklch(0.141 0.005 285.823)') }, // zinc-950
    foreground: { DEFAULT: oklchToRgba('oklch(0.985 0 0)') }, // zinc-50
    primary: {
      DEFAULT: oklchToRgba('oklch(0.552 0.016 285.938)'), // zinc-500
      50: oklchToRgba('oklch(0.985 0 0)'),
      100: oklchToRgba('oklch(0.967 0.001 286.375)'),
      200: oklchToRgba('oklch(0.92 0.004 286.32)'),
      300: oklchToRgba('oklch(0.871 0.006 286.286)'),
      400: oklchToRgba('oklch(0.705 0.015 286.067)'),
      500: oklchToRgba('oklch(0.552 0.016 285.938)'),
      600: oklchToRgba('oklch(0.442 0.017 285.786)'),
      700: oklchToRgba('oklch(0.37 0.013 285.805)'),
      800: oklchToRgba('oklch(0.274 0.006 286.033)'),
      900: oklchToRgba('oklch(0.21 0.006 285.885)'),
      950: oklchToRgba('oklch(0.141 0.005 285.823)'),
    },
    muted: {
      DEFAULT: oklchToRgba('oklch(0.274 0.006 286.033)'), // zinc-800
    },
    'muted-foreground': {
      DEFAULT: oklchToRgba('oklch(0.705 0.015 286.067)'), // zinc-400
    },
    destructive: {
      DEFAULT: oklchToRgba('oklch(0.577 0.245 27.325)'), // red-600
    },
    border: {
      DEFAULT: oklchToRgba('oklch(0.274 0.006 286.033)'), // zinc-800
    },
    card: {
      DEFAULT: oklchToRgba('oklch(0.21 0.006 285.885)'), // zinc-900
    },
    'card-foreground': {
      DEFAULT: oklchToRgba('oklch(0.985 0 0)'), // zinc-50
    },
  },
  baseFontSize: 16,
};

// ─── Resolver ───────────────────────────────────────────────────

function resolveColor(value: string, theme: NativeTheme): RGBA | null {
  // Hex color
  if (value.startsWith('#')) return parseHexColor(value);

  // CSS keywords
  if (value === 'transparent') return [0, 0, 0, 0];
  if (value === 'white') return [1, 1, 1, 1];
  if (value === 'black') return [0, 0, 0, 1];

  // Theme namespace with shade: primary.600
  if (value.includes('.')) {
    const [ns, shade] = value.split('.');
    const palette = theme.colors[ns];
    if (palette?.[shade]) return palette[shade];
  }

  // Theme namespace without shade: foreground, background
  const palette = theme.colors[value];
  if (palette?.DEFAULT) return palette.DEFAULT;

  return null;
}

export function createNativeTokenResolver(theme: NativeTheme): NativeTokenResolver {
  return {
    resolve(property: string, value: string): NativeStyleMap {
      // Spacing properties (p, px, m, gap, etc.)
      const spacingProps = SPACING_PROPS[property];
      if (spacingProps) {
        const px = SPACING_SCALE[value];
        if (px !== undefined) {
          const result: NativeStyleMap = {};
          for (const prop of spacingProps) {
            result[prop] = px;
          }
          return result;
        }
        // Try as raw number (pixels)
        const num = Number(value);
        if (!Number.isNaN(num)) {
          const result: NativeStyleMap = {};
          for (const prop of spacingProps) {
            result[prop] = num;
          }
          return result;
        }
      }

      // Color properties
      if (property === 'bg') {
        const color = resolveColor(value, theme);
        if (color) return { backgroundColor: color };
      }
      if (property === 'text') {
        const color = resolveColor(value, theme);
        if (color) return { color };
      }
      if (property === 'border') {
        const color = resolveColor(value, theme);
        if (color) return { borderColor: color };
      }

      // Border radius
      if (property === 'rounded') {
        const px = RADIUS_SCALE[value];
        if (px !== undefined) return { borderRadius: px };
      }

      // Font size
      if (property === 'font') {
        const px = FONT_SIZE_SCALE[value];
        if (px !== undefined) return { fontSize: px };
      }

      // Font weight
      if (property === 'weight') {
        const w = FONT_WEIGHT_SCALE[value];
        if (w !== undefined) return { fontWeight: w };
      }

      // Width / height (use spacing scale for numeric values)
      if (property === 'w') {
        const px = SPACING_SCALE[value];
        if (px !== undefined) return { width: px };
      }
      if (property === 'h') {
        const px = SPACING_SCALE[value];
        if (px !== undefined) return { height: px };
      }

      return {};
    },
  };
}
