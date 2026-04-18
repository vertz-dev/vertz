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
      return `token.font.lineHeight.${value}`;
    case 'content':
      return mapContent(value);
    case 'ring':
    case 'display':
    case 'raw':
      return quote(value);
  }
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

function mapColor(value: string, property: string): string {
  if (CSS_COLOR_KEYWORDS.has(value)) return quote(value);

  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = value.substring(0, dotIndex);
    const shade = value.substring(dotIndex + 1);
    return `token.color.${namespace}[${shade}]`;
  }
  if (COLOR_NAMESPACES.has(value)) return `token.color.${value}`;
  throw new TypeError(`Invalid color value '${value}' for '${property}'`);
}

function mapRadius(value: string): string {
  return `token.radius.${value}`;
}

function mapShadow(value: string): string {
  return `token.shadow.${value}`;
}

function mapSize(value: string, property: string): string {
  if (SPACING_SCALE[value] !== undefined) return spacingAccess(value);
  const keyword = SIZE_KEYWORDS[value];
  if (keyword !== undefined) return quote(keyword);
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
  return `token.font.size.${value}`;
}

function mapFontWeight(value: string): string {
  if (FONT_WEIGHT_SCALE[value] === undefined) {
    throw new TypeError(`Invalid font-weight value '${value}'`);
  }
  return `token.font.weight.${value}`;
}

function mapText(value: string): MappedEntry[] {
  if (FONT_SIZE_SCALE[value] !== undefined) {
    return [{ cssKey: 'fontSize', valueExpr: `token.font.size.${value}` }];
  }
  if (TEXT_ALIGN_KEYWORDS.has(value)) {
    return [{ cssKey: 'textAlign', valueExpr: quote(value) }];
  }
  return [{ cssKey: 'color', valueExpr: mapColor(value, 'text') }];
}

function mapFont(value: string): MappedEntry[] {
  if (FONT_FAMILY_KEYS.has(value)) {
    return [{ cssKey: 'fontFamily', valueExpr: `token.font.family.${value}` }];
  }
  if (FONT_WEIGHT_SCALE[value] !== undefined) {
    return [{ cssKey: 'fontWeight', valueExpr: `token.font.weight.${value}` }];
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

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function quote(value: string): string {
  return `'${value}'`;
}
