/**
 * CSS File Extractor — Extracts CSS from `css()` calls into separate `.css` files.
 *
 * Walks the AST to find css() calls, resolves the array shorthands statically
 * (using the same token resolution as the runtime/css-transformer), generates
 * CSS rule text for each block, and outputs extracted CSS as a string.
 *
 * This is the core of zero-runtime CSS extraction: all css() calls resolve
 * at build time, so no CSS-in-JS runtime ships in the browser.
 */

import type { Node } from 'ts-morph';
import { Project, SyntaxKind, ts } from 'ts-morph';

/** Result of extracting CSS from a source file. */
export interface CSSExtractionResult {
  /** The extracted CSS rules as a string. */
  css: string;
  /** The block names found in static css() calls. */
  blockNames: string[];
}

/**
 * Extracts CSS from css() calls in source code.
 * Produces a CSS string and list of block names for each file.
 */
export class CSSExtractor {
  /**
   * Extract CSS from all static css() calls in the given source.
   * @param source - The source code to analyze.
   * @param filePath - The file path (used for deterministic class name generation).
   * @returns The extracted CSS and block names.
   */
  extract(source: string, filePath: string): CSSExtractionResult {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
    });
    const sourceFile = project.createSourceFile(filePath, source);

    const allCssRules: string[] = [];
    const allBlockNames: string[] = [];

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expression = call.getExpression();
      if (!expression.isKind(SyntaxKind.Identifier) || expression.getText() !== 'css') {
        continue;
      }

      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0] as Node;
      if (!firstArg.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

      // Check if the call is static
      if (!isStaticCSSCall(firstArg)) continue;

      for (const prop of firstArg.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

        const blockName = prop.getName();
        allBlockNames.push(blockName);

        const className = generateClassName(filePath, blockName);
        const init = prop.getInitializer();
        if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) continue;

        const entries = extractEntries(init);
        const rules = buildCSSRules(className, entries);
        allCssRules.push(...rules);
      }
    }

    return {
      css: allCssRules.join('\n'),
      blockNames: allBlockNames,
    };
  }
}

// ─── Static Analysis ───────────────────────────────────────────

/** Check whether a css() argument is fully static (all string literals). */
function isStaticCSSCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;

  for (const prop of node.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;

    const initializer = prop.getInitializer();
    if (!initializer || !initializer.isKind(SyntaxKind.ArrayLiteralExpression)) return false;

    for (const element of initializer.getElements()) {
      if (element.isKind(SyntaxKind.StringLiteral)) continue;
      if (element.isKind(SyntaxKind.ObjectLiteralExpression)) {
        if (!isStaticNestedObject(element)) return false;
        continue;
      }
      return false;
    }
  }

  return true;
}

function isStaticNestedObject(node: Node): boolean {
  if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;

  for (const prop of node.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;
    const init = prop.getInitializer();
    if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) return false;
    for (const el of init.getElements()) {
      if (!el.isKind(SyntaxKind.StringLiteral)) return false;
    }
  }

  return true;
}

// ─── Entry Extraction ──────────────────────────────────────────

interface ExtractedEntry {
  kind: 'shorthand' | 'nested';
  value: string;
  selector?: string;
  entries?: string[];
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

// ─── CSS Rule Building ─────────────────────────────────────────

function buildCSSRules(className: string, entries: ExtractedEntry[]): string[] {
  const rules: string[] = [];
  const baseDecls: string[] = [];
  const pseudoDecls = new Map<string, string[]>();

  for (const entry of entries) {
    if (entry.kind === 'shorthand') {
      const parsed = parseShorthand(entry.value);
      if (!parsed) continue;

      const resolved = resolveDeclarations(parsed);
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
        const parsed = parseShorthand(nestedEntry);
        if (!parsed) continue;
        const resolved = resolveDeclarations(parsed);
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

// ─── Shorthand Parser (mirrors css-transformer.ts) ─────────────

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

interface ParsedShorthand {
  property: string;
  value: string | null;
  pseudo: string | null;
}

function parseShorthand(input: string): ParsedShorthand | null {
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

// ─── Token Resolver (mirrors css-transformer.ts) ───────────────

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
  svw: '100svw',
  dvw: '100dvw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',
  auto: 'auto',
};

const HEIGHT_AXIS_PROPERTIES = new Set(['h', 'min-h', 'max-h']);

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
  ring: { properties: ['outline'], valueType: 'ring' },
  content: { properties: ['content'], valueType: 'content' },
};

const CONTENT_MAP: Record<string, string> = {
  empty: "''",
  none: 'none',
};

function resolveDeclarations(parsed: ParsedShorthand): string[] | null {
  const { property, value } = parsed;

  // Display keywords
  if (DISPLAY_MAP[property] !== undefined && value === null) {
    return [`display: ${DISPLAY_MAP[property]};`];
  }

  const mapping = PROPERTY_MAP[property];
  if (!mapping || value === null) return null;

  const resolvedValue = resolveValue(value, mapping.valueType, property);
  if (resolvedValue === null) return null;

  return mapping.properties.map((prop) => `${prop}: ${resolvedValue};`);
}

function resolveValue(value: string, valueType: string, property: string): string | null {
  switch (valueType) {
    case 'spacing':
      return SPACING_SCALE[value] ?? null;
    case 'color':
      return resolveColor(value);
    case 'radius':
      return RADIUS_SCALE[value] ?? null;
    case 'shadow':
      return SHADOW_SCALE[value] ?? null;
    case 'size': {
      if (value === 'screen') {
        return HEIGHT_AXIS_PROPERTIES.has(property) ? '100vh' : '100vw';
      }
      return SPACING_SCALE[value] ?? SIZE_KEYWORDS[value] ?? null;
    }
    case 'alignment':
      return ALIGNMENT_MAP[value] ?? null;
    case 'font-size':
      return FONT_SIZE_SCALE[value] ?? null;
    case 'font-weight':
      return FONT_WEIGHT_SCALE[value] ?? null;
    case 'line-height':
      return LINE_HEIGHT_SCALE[value] ?? null;
    case 'ring': {
      const num = Number(value);
      if (Number.isNaN(num) || num < 0) return null;
      return `${num}px solid var(--color-ring)`;
    }
    case 'content':
      return CONTENT_MAP[value] ?? null;
    default:
      return value;
  }
}

function resolveColor(value: string): string | null {
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

// ─── Class Name Generation ─────────────────────────────────────

/** Deterministic class name generation (mirrors css-transformer.ts). */
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
