/**
 * CSS Transformer — Replace static css() calls with class name references
 * and extract CSS into a separate output.
 *
 * For static css() calls:
 * 1. Parse all shorthand entries
 * 2. Resolve tokens to CSS values
 * 3. Generate deterministic class names
 * 4. Replace the css() call with a plain object mapping block names to class names
 * 5. Collect extracted CSS rules
 *
 * For reactive css() calls:
 * - Leave the call in place (runtime handles it)
 * - Emit a diagnostic info message
 */

import type MagicString from 'magic-string';
import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { CSSCallInfo } from '../analyzers/css-analyzer';

/** Result of CSS transformation. */
export interface CSSTransformResult {
  /** Extracted CSS rules. */
  css: string;
  /** Class name mappings per css() call: call index → { blockName → className }. */
  classNameMaps: Map<number, Record<string, string>>;
}

/**
 * Transform static css() calls in the source.
 */
export class CSSTransformer {
  transform(
    s: MagicString,
    sourceFile: SourceFile,
    cssCalls: CSSCallInfo[],
    filePath: string,
  ): CSSTransformResult {
    const allCssRules: string[] = [];
    const classNameMaps = new Map<number, Record<string, string>>();

    // Process calls in reverse order so positions remain valid
    const sortedCalls = [...cssCalls].sort((a, b) => b.start - a.start);

    for (const call of sortedCalls) {
      if (call.kind !== 'static') continue;

      const callIndex = cssCalls.indexOf(call);
      const { classNames, cssRules } = this.processStaticCall(sourceFile, call, filePath);

      classNameMaps.set(callIndex, classNames);
      allCssRules.push(...cssRules);

      // Replace css({...}) with the class names object
      const replacement = this.buildReplacement(classNames);
      s.overwrite(call.start, call.end, replacement);
    }

    return {
      css: allCssRules.join('\n'),
      classNameMaps,
    };
  }

  /** Process a static css() call to extract CSS and generate class names. */
  private processStaticCall(
    sourceFile: SourceFile,
    call: CSSCallInfo,
    filePath: string,
  ): { classNames: Record<string, string>; cssRules: string[] } {
    // Use the css() runtime to do the heavy lifting.
    // We need to parse the AST to extract the actual shorthand values.
    const classNames: Record<string, string> = {};
    const cssRules: string[] = [];

    // Find the actual call node in the AST
    const callNode = findCallAtPosition(sourceFile, call.start);
    if (!callNode) return { classNames, cssRules };

    const args = callNode.getArguments();
    if (args.length === 0) return { classNames, cssRules };

    const firstArg = args[0];
    if (!firstArg || !firstArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return { classNames, cssRules };
    }

    // We need to import the CSS processing functions
    // For now, extract the string values and use them directly
    for (const prop of firstArg.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

      const blockName = prop.getName();
      const className = generateClassName(filePath, blockName);
      classNames[blockName] = className;

      const init = prop.getInitializer();
      if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) continue;

      const entries = extractEntries(init);
      const rules = buildCSSRules(className, entries);
      cssRules.push(...rules);
    }

    return { classNames, cssRules };
  }

  /** Build the replacement JS expression: { card: '_a1b2c3d4', title: '_e5f6g7h8' } */
  private buildReplacement(classNames: Record<string, string>): string {
    const entries = Object.entries(classNames)
      .map(([name, className]) => `${name}: '${className}'`)
      .join(', ');
    return `{ ${entries} }`;
  }
}

// ─── Helpers ───────────────────────────────────────────────────

import type { CallExpression, Node } from 'ts-morph';

function findCallAtPosition(sourceFile: SourceFile, start: number): CallExpression | null {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (call.getStart() === start) return call;
  }
  return null;
}

/** Extract string entries and nested objects from an array literal. */
interface ExtractedEntry {
  kind: 'shorthand' | 'nested';
  value: string; // For shorthand
  selector?: string; // For nested
  entries?: string[]; // For nested
}

function extractEntries(arrayNode: Node): ExtractedEntry[] {
  if (!arrayNode.isKind(SyntaxKind.ArrayLiteralExpression)) return [];

  const results: ExtractedEntry[] = [];

  for (const element of arrayNode.getElements()) {
    if (element.isKind(SyntaxKind.StringLiteral)) {
      results.push({ kind: 'shorthand', value: element.getLiteralValue() });
    } else if (element.isKind(SyntaxKind.ObjectLiteralExpression)) {
      for (const prop of element.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

        const selector = prop.getName();
        // Handle quoted property names (e.g. '&::after')
        const nameNode = prop.getNameNode();
        const actualSelector = nameNode.isKind(SyntaxKind.StringLiteral)
          ? nameNode.getLiteralValue()
          : selector;

        const init = prop.getInitializer();
        if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) continue;

        const nestedEntries: string[] = [];
        for (const el of init.getElements()) {
          if (el.isKind(SyntaxKind.StringLiteral)) {
            nestedEntries.push(el.getLiteralValue());
          }
        }

        results.push({
          kind: 'nested',
          value: '',
          selector: actualSelector,
          entries: nestedEntries,
        });
      }
    }
  }

  return results;
}

// Inline minimal versions of the CSS processing to avoid circular dependency
// with @vertz/ui at compile time.

/** Deterministic class name generation (mirrors class-generator.ts). */
function generateClassName(filePath: string, blockName: string): string {
  const input = `${filePath}::${blockName}`;
  const hash = djb2Hash(input);
  return `_${hash}`;
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Build CSS rules from extracted entries. */
function buildCSSRules(className: string, entries: ExtractedEntry[]): string[] {
  const rules: string[] = [];
  const baseDecls: string[] = [];
  const pseudoDecls = new Map<string, string[]>();

  for (const entry of entries) {
    if (entry.kind === 'shorthand') {
      const parsed = parseShorthandInline(entry.value);
      if (!parsed) continue;

      const resolved = resolveInline(parsed);
      if (!resolved) continue;

      if (parsed.pseudo) {
        const existing = pseudoDecls.get(parsed.pseudo) ?? [];
        existing.push(...resolved);
        pseudoDecls.set(parsed.pseudo, existing);
      } else {
        baseDecls.push(...resolved);
      }
    } else if (entry.kind === 'nested' && entry.selector && entry.entries) {
      const nestedDecls: string[] = [];
      for (const nestedEntry of entry.entries) {
        const parsed = parseShorthandInline(nestedEntry);
        if (!parsed) continue;
        const resolved = resolveInline(parsed);
        if (!resolved) continue;
        nestedDecls.push(...resolved);
      }
      const resolvedSelector = entry.selector.replace('&', `.${className}`);
      if (nestedDecls.length > 0) {
        rules.push(formatCSSRule(resolvedSelector, nestedDecls));
      }
    }
  }

  if (baseDecls.length > 0) {
    rules.unshift(formatCSSRule(`.${className}`, baseDecls));
  }

  for (const [pseudo, decls] of pseudoDecls) {
    rules.push(formatCSSRule(`.${className}${pseudo}`, decls));
  }

  return rules;
}

function formatCSSRule(selector: string, declarations: string[]): string {
  const props = declarations.map((d) => `  ${d}`).join('\n');
  return `${selector} {\n${props}\n}`;
}

// ─── Inline shorthand parser (compiler-side, no @vertz/ui dependency) ──────

const PSEUDO_PREFIXES = new Set([
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'first',
  'last',
]);

const PSEUDO_MAP: Record<string, string> = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  active: ':active',
  disabled: ':disabled',
  first: ':first-child',
  last: ':last-child',
};

interface InlineParsed {
  property: string;
  value: string | null;
  pseudo: string | null;
}

function parseShorthandInline(input: string): InlineParsed | null {
  const parts = input.split(':');
  if (parts.length === 1) {
    const [property] = parts as [string];
    return { property, value: null, pseudo: null };
  }
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (PSEUDO_PREFIXES.has(a)) {
      return { property: b, value: null, pseudo: PSEUDO_MAP[a] ?? a };
    }
    return { property: a, value: b, pseudo: null };
  }
  if (parts.length === 3) {
    const [a, b, c] = parts as [string, string, string];
    if (PSEUDO_PREFIXES.has(a)) {
      return { property: b, value: c, pseudo: PSEUDO_MAP[a] ?? a };
    }
  }
  return null;
}

// ─── Inline token resolver (compiler-side) ─────────────────────

const DISPLAY_MAP: Record<string, string> = {
  flex: 'flex',
  grid: 'grid',
  block: 'block',
  inline: 'inline',
  hidden: 'none',
};

const SPACING_SCALE: Record<string, string> = {
  '0': '0',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
  auto: 'auto',
};

const RADIUS_SCALE: Record<string, string> = {
  none: '0',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
};

const SHADOW_SCALE: Record<string, string> = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  none: 'none',
};

const FONT_SIZE_SCALE: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
};

const FONT_WEIGHT_SCALE: Record<string, string> = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

const LINE_HEIGHT_SCALE: Record<string, string> = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
};

const ALIGNMENT_MAP: Record<string, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
  stretch: 'stretch',
  baseline: 'baseline',
};

const SIZE_KEYWORDS: Record<string, string> = {
  full: '100%',
  screen: '100vw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',
  auto: 'auto',
};

const COLOR_NAMESPACES = new Set([
  'primary',
  'secondary',
  'accent',
  'background',
  'foreground',
  'muted',
  'destructive',
  'success',
  'warning',
  'info',
  'border',
  'ring',
  'input',
  'card',
  'popover',
]);

interface PropertyMapping {
  properties: string[];
  valueType: string;
}

const PROPERTY_MAP: Record<string, PropertyMapping> = {
  p: { properties: ['padding'], valueType: 'spacing' },
  px: { properties: ['padding-inline'], valueType: 'spacing' },
  py: { properties: ['padding-block'], valueType: 'spacing' },
  pt: { properties: ['padding-top'], valueType: 'spacing' },
  pr: { properties: ['padding-right'], valueType: 'spacing' },
  pb: { properties: ['padding-bottom'], valueType: 'spacing' },
  pl: { properties: ['padding-left'], valueType: 'spacing' },
  m: { properties: ['margin'], valueType: 'spacing' },
  mx: { properties: ['margin-inline'], valueType: 'spacing' },
  my: { properties: ['margin-block'], valueType: 'spacing' },
  mt: { properties: ['margin-top'], valueType: 'spacing' },
  mr: { properties: ['margin-right'], valueType: 'spacing' },
  mb: { properties: ['margin-bottom'], valueType: 'spacing' },
  ml: { properties: ['margin-left'], valueType: 'spacing' },
  w: { properties: ['width'], valueType: 'size' },
  h: { properties: ['height'], valueType: 'size' },
  'min-w': { properties: ['min-width'], valueType: 'size' },
  'max-w': { properties: ['max-width'], valueType: 'size' },
  'min-h': { properties: ['min-height'], valueType: 'size' },
  'max-h': { properties: ['max-height'], valueType: 'size' },
  bg: { properties: ['background-color'], valueType: 'color' },
  text: { properties: ['color'], valueType: 'color' },
  border: { properties: ['border-color'], valueType: 'color' },
  rounded: { properties: ['border-radius'], valueType: 'radius' },
  shadow: { properties: ['box-shadow'], valueType: 'shadow' },
  gap: { properties: ['gap'], valueType: 'spacing' },
  items: { properties: ['align-items'], valueType: 'alignment' },
  justify: { properties: ['justify-content'], valueType: 'alignment' },
  font: { properties: ['font-size'], valueType: 'font-size' },
  weight: { properties: ['font-weight'], valueType: 'font-weight' },
  leading: { properties: ['line-height'], valueType: 'line-height' },
};

function resolveInline(parsed: InlineParsed): string[] | null {
  const { property, value } = parsed;

  // Display keywords
  if (DISPLAY_MAP[property] !== undefined && value === null) {
    return [`display: ${DISPLAY_MAP[property]};`];
  }

  const mapping = PROPERTY_MAP[property];
  if (!mapping || value === null) return null;

  const resolvedValue = resolveValueInline(value, mapping.valueType, property);
  if (resolvedValue === null) return null;

  return mapping.properties.map((prop) => `${prop}: ${resolvedValue};`);
}

function resolveValueInline(value: string, valueType: string, _property: string): string | null {
  switch (valueType) {
    case 'spacing':
      return SPACING_SCALE[value] ?? null;
    case 'color':
      return resolveColorInline(value);
    case 'radius':
      return RADIUS_SCALE[value] ?? null;
    case 'shadow':
      return SHADOW_SCALE[value] ?? null;
    case 'size':
      return SPACING_SCALE[value] ?? SIZE_KEYWORDS[value] ?? null;
    case 'alignment':
      return ALIGNMENT_MAP[value] ?? null;
    case 'font-size':
      return FONT_SIZE_SCALE[value] ?? null;
    case 'font-weight':
      return FONT_WEIGHT_SCALE[value] ?? null;
    case 'line-height':
      return LINE_HEIGHT_SCALE[value] ?? null;
    default:
      return value;
  }
}

function resolveColorInline(value: string): string | null {
  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = value.substring(0, dotIndex);
    const shade = value.substring(dotIndex + 1);
    if (COLOR_NAMESPACES.has(namespace)) {
      return `var(--color-${namespace}-${shade})`;
    }
    return null;
  }
  if (COLOR_NAMESPACES.has(value)) {
    return `var(--color-${value})`;
  }
  const cssKeywords = new Set(['transparent', 'inherit', 'currentColor', 'initial', 'unset']);
  if (cssKeywords.has(value)) return value;
  return null;
}
