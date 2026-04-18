/**
 * Maps a single shorthand string (e.g. `p:4`, `hover:bg:primary.500`, `truncate`)
 * to one or more object-form CSS declarations for the migration script.
 *
 * Output shape is designed to plug into an object-literal emitter:
 *   { entries: [{ cssKey: 'padding', valueExpr: 'token.spacing[4]' }], pseudo: null }
 *
 * - `cssKey`: camelCase CSS property name (assignable inside a StyleBlock).
 * - `valueExpr`: a raw expression string ready to be spliced into source code.
 *     Token paths are bare (`token.color.primary[500]`). String literals are
 *     quoted (`"'auto'"`).
 * - `pseudo`: the nested-selector key (`&:hover`, `&:focus`, ...) or null.
 */

import type { PropertyMapping } from '../../packages/ui/src/css/token-tables';
import {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from '../../packages/ui/src/css/token-tables';

export interface MappedEntry {
  cssKey: string;
  valueExpr: string;
}

export interface MappedShorthand {
  entries: MappedEntry[];
  pseudo: string | null;
}

const FONT_FAMILY_KEYS: ReadonlySet<string> = new Set(['mono', 'sans', 'serif']);
const TEXT_ALIGN_KEYWORDS: ReadonlySet<string> = new Set([
  'center',
  'left',
  'right',
  'justify',
  'start',
  'end',
]);

export function mapShorthand(input: string): MappedShorthand {
  if (!input || input.trim() === '') {
    throw new TypeError('Empty shorthand string');
  }

  const trimmed = input.trim();
  const parts = trimmed.split(':');

  let pseudo: string | null = null;
  let property: string;
  let value: string | null;

  if (parts.length === 1) {
    property = parts[0]!;
    value = null;
  } else if (parts.length === 2) {
    const [first, second] = parts as [string, string];
    if (PSEUDO_PREFIXES.has(first)) {
      pseudo = toNestedPseudo(first);
      property = second;
      value = null;
    } else {
      property = first;
      value = second;
    }
  } else if (parts.length === 3) {
    const [first, second, third] = parts as [string, string, string];
    if (!PSEUDO_PREFIXES.has(first)) {
      throw new TypeError(`Invalid shorthand '${input}': unknown pseudo prefix '${first}'`);
    }
    pseudo = toNestedPseudo(first);
    property = second;
    value = third;
  } else {
    throw new TypeError(`Invalid shorthand '${input}': too many segments`);
  }

  if (value === null) {
    const keyword = KEYWORD_MAP[property];
    if (keyword !== undefined) {
      return {
        entries: keyword.map((entry) => ({
          cssKey: toCamel(entry.property),
          valueExpr: quote(entry.value),
        })),
        pseudo,
      };
    }
    throw new TypeError(`Invalid shorthand '${input}': unknown keyword '${property}'`);
  }

  const mapping = PROPERTY_MAP[property];
  if (mapping === undefined) {
    throw new TypeError(`Invalid shorthand '${input}': unknown property '${property}'`);
  }

  if (property === 'text') return { entries: mapText(value), pseudo };
  if (property === 'font') return { entries: mapFont(value), pseudo };
  if (property === 'border') return { entries: mapBorder(value), pseudo };
  if (property === 'ring') return { entries: mapRing(value), pseudo };

  const valueExpr = mapValueForType(value, mapping.valueType, property);
  const entries = mapping.properties.map((cssProp) => ({
    cssKey: toCamel(cssProp),
    valueExpr,
  }));
  return { entries, pseudo };
}

function toNestedPseudo(prefix: string): string {
  const pseudo = PSEUDO_MAP[prefix];
  if (pseudo === undefined) {
    throw new TypeError(`Unknown pseudo prefix '${prefix}'`);
  }
  return `&${pseudo}`;
}

function mapValueForType(
  value: string,
  valueType: PropertyMapping['valueType'],
  property: string,
): string {
  switch (valueType) {
    case 'spacing':
      return mapSpacing(value, property);
    case 'color':
      return mapColor(value, property);
    case 'radius':
      return mapRadius(value);
    case 'shadow':
      return mapShadow(value);
    case 'size':
      return mapSize(value, property);
    case 'alignment':
      return mapAlignment(value, property);
    case 'font-size':
      return mapFontSize(value);
    case 'font-weight':
      return mapFontWeight(value);
    case 'line-height':
      return memberAccess('token.font.lineHeight', value);
    case 'content':
      return mapContent(value);
    case 'ring':
    case 'display':
    case 'raw':
      return mapRaw(value, property);
  }
}

const TRANSITION_TIMING = '150ms cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_COLOR_PROPS = [
  'color',
  'background-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
];
const TRANSITION_MAP: Record<string, string> = {
  none: 'none',
  all: `all ${TRANSITION_TIMING}`,
  colors: TRANSITION_COLOR_PROPS.map((p) => `${p} ${TRANSITION_TIMING}`).join(', '),
  shadow: `box-shadow ${TRANSITION_TIMING}`,
  transform: `transform ${TRANSITION_TIMING}`,
  opacity: `opacity ${TRANSITION_TIMING}`,
};

const TRACKING_MAP: Record<string, string> = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
};

const ASPECT_MAP: Record<string, string> = {
  square: '1 / 1',
  video: '16 / 9',
  photo: '4 / 3',
};

const POSITION_PROPERTIES = new Set(['inset', 'top', 'right', 'bottom', 'left']);

function mapRaw(value: string, property: string): string {
  if (
    property === 'border-r' ||
    property === 'border-l' ||
    property === 'border-t' ||
    property === 'border-b'
  ) {
    const num = Number(value);
    if (!Number.isNaN(num)) return quote(`${num}px`);
    return quote(value);
  }

  if (property === 'transition') {
    const mapped = TRANSITION_MAP[value];
    if (mapped !== undefined) return quote(mapped);
    return quote(value);
  }

  if (property === 'tracking') {
    const mapped = TRACKING_MAP[value];
    if (mapped !== undefined) return quote(mapped);
    return quote(value);
  }

  if (property === 'grid-cols') {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) return quote(`repeat(${num}, minmax(0, 1fr))`);
    return quote(value);
  }

  if (property === 'aspect') {
    const mapped = ASPECT_MAP[value];
    if (mapped !== undefined) return quote(mapped);
    return quote(value);
  }

  if (POSITION_PROPERTIES.has(property)) {
    if (SPACING_SCALE[value] !== undefined) return spacingAccess(value);
    return quote(value);
  }

  return quote(value);
}

function mapSpacing(value: string, property: string): string {
  if (value === 'auto') return quote('auto');
  if (SPACING_SCALE[value] === undefined) {
    throw new TypeError(`Invalid spacing value '${value}' for '${property}'`);
  }
  return spacingAccess(value);
}

function spacingAccess(key: string): string {
  return /^\d+$/.test(key) ? `token.spacing[${key}]` : `token.spacing['${key}']`;
}

const OPACITY_PATTERN = /^(.+)\/(\d+)$/;

function mapColor(value: string, property: string): string {
  if (CSS_COLOR_KEYWORDS.has(value)) return quote(value);

  const opacityMatch = OPACITY_PATTERN.exec(value);
  if (opacityMatch) {
    const colorPart = opacityMatch[1]!;
    const opacityStr = opacityMatch[2]!;
    const opacity = Number(opacityStr);
    if (opacity < 0 || opacity > 100) {
      throw new TypeError(
        `Invalid opacity '${opacityStr}' in '${value}' for '${property}': must be 0-100`,
      );
    }
    const cssVar = colorToCssVar(colorPart, property);
    return quote(`color-mix(in oklch, ${cssVar} ${opacity}%, transparent)`);
  }

  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = value.substring(0, dotIndex);
    const shade = value.substring(dotIndex + 1);
    return `token.color${accessKey(namespace)}[${shadeKey(shade)}]`;
  }
  if (COLOR_NAMESPACES.has(value)) return `token.color${accessKey(value)}`;
  throw new TypeError(`Invalid color value '${value}' for '${property}'`);
}

function colorToCssVar(color: string, property: string): string {
  const dotIndex = color.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = color.substring(0, dotIndex);
    const shade = color.substring(dotIndex + 1);
    if (COLOR_NAMESPACES.has(namespace)) return `var(--color-${namespace}-${shade})`;
    throw new TypeError(`Invalid color namespace '${namespace}' for '${property}'`);
  }
  if (COLOR_NAMESPACES.has(color)) return `var(--color-${color})`;
  throw new TypeError(`Invalid color value '${color}' for '${property}'`);
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

function accessKey(name: string): string {
  return IDENT_RE.test(name) ? `.${name}` : `['${name}']`;
}

function memberAccess(base: string, key: string): string {
  return `${base}${accessKey(key)}`;
}

function shadeKey(shade: string): string {
  return /^\d+$/.test(shade) ? shade : `'${shade}'`;
}

function mapRadius(value: string): string {
  return memberAccess('token.radius', value);
}

function mapShadow(value: string): string {
  return memberAccess('token.shadow', value);
}

const FRACTION_PATTERN = /^(\d+)\/(\d+)$/;

function mapSize(value: string, property: string): string {
  if (SPACING_SCALE[value] !== undefined) return spacingAccess(value);
  if (value === 'screen') {
    return HEIGHT_AXIS_PROPERTIES.has(property) ? quote('100vh') : quote('100vw');
  }
  const keyword = SIZE_KEYWORDS[value];
  if (keyword !== undefined) return quote(keyword);
  const fractionMatch = FRACTION_PATTERN.exec(value);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator === 0) {
      throw new TypeError(`Invalid fraction '${value}' for '${property}': denominator is zero`);
    }
    const percent = (numerator / denominator) * 100;
    const formatted = percent % 1 === 0 ? `${percent}` : percent.toFixed(6);
    return quote(`${formatted}%`);
  }
  throw new TypeError(`Invalid size value '${value}' for '${property}'`);
}

function mapAlignment(value: string, property: string): string {
  const mapped = ALIGNMENT_MAP[value];
  if (mapped === undefined) {
    throw new TypeError(`Invalid alignment value '${value}' for '${property}'`);
  }
  return quote(mapped);
}

function mapFontSize(value: string): string {
  if (FONT_SIZE_SCALE[value] === undefined) {
    throw new TypeError(`Invalid font-size value '${value}'`);
  }
  return memberAccess('token.font.size', value);
}

function mapFontWeight(value: string): string {
  if (FONT_WEIGHT_SCALE[value] === undefined) {
    throw new TypeError(`Invalid font-weight value '${value}'`);
  }
  return memberAccess('token.font.weight', value);
}

function mapText(value: string): MappedEntry[] {
  if (FONT_SIZE_SCALE[value] !== undefined) {
    return [{ cssKey: 'fontSize', valueExpr: memberAccess('token.font.size', value) }];
  }
  if (TEXT_ALIGN_KEYWORDS.has(value)) {
    return [{ cssKey: 'textAlign', valueExpr: quote(value) }];
  }
  return [{ cssKey: 'color', valueExpr: mapColor(value, 'text') }];
}

function mapFont(value: string): MappedEntry[] {
  if (FONT_FAMILY_KEYS.has(value)) {
    return [{ cssKey: 'fontFamily', valueExpr: memberAccess('token.font.family', value) }];
  }
  if (FONT_WEIGHT_SCALE[value] !== undefined) {
    return [{ cssKey: 'fontWeight', valueExpr: memberAccess('token.font.weight', value) }];
  }
  return [{ cssKey: 'fontSize', valueExpr: mapFontSize(value) }];
}

function mapContent(value: string): string {
  const mapped = CONTENT_MAP[value];
  if (mapped === undefined) {
    throw new TypeError(`Invalid content value '${value}'`);
  }
  return JSON.stringify(mapped);
}

function mapBorder(value: string): MappedEntry[] {
  const num = Number(value);
  if (!Number.isNaN(num) && num >= 0) {
    return [{ cssKey: 'borderWidth', valueExpr: quote(`${num}px`) }];
  }
  return [{ cssKey: 'borderColor', valueExpr: mapColor(value, 'border') }];
}

function mapRing(value: string): MappedEntry[] {
  const num = Number(value);
  if (!Number.isNaN(num) && num >= 0) {
    return [{ cssKey: 'outline', valueExpr: quote(`${num}px solid var(--color-ring)`) }];
  }
  return [{ cssKey: 'outlineColor', valueExpr: mapColor(value, 'ring') }];
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function quote(value: string): string {
  return `'${value}'`;
}
