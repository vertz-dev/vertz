/**
 * CSS File Extractor -- Extracts CSS from `css()` calls into separate `.css` files.
 *
 * Walks the AST to find css() calls, resolves the array shorthands statically
 * (using the shared token tables from @vertz/ui/internals), generates
 * CSS rule text for each block, and outputs extracted CSS as a string.
 *
 * This is the core of zero-runtime CSS extraction: all css() calls resolve
 * at build time, so no CSS-in-JS runtime ships in the browser.
 */

import {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  DISPLAY_MAP,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from '@vertz/ui/internals';
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
    if (!init) return false;

    // Accept array values: ['shorthand', { 'css-prop': 'value' }]
    if (init.isKind(SyntaxKind.ArrayLiteralExpression)) {
      for (const el of init.getElements()) {
        if (el.isKind(SyntaxKind.StringLiteral)) continue;
        if (el.isKind(SyntaxKind.ObjectLiteralExpression)) {
          if (isStaticCSSObject(el)) continue;
          return false;
        }
        return false;
      }
      continue;
    }

    // Accept direct object values: { 'flex-direction': 'row', ... }
    if (init.isKind(SyntaxKind.ObjectLiteralExpression)) {
      if (isStaticCSSObject(init)) continue;
      return false;
    }

    return false;
  }

  return true;
}

/** Check if a node is a static CSS declarations object: all properties have string literal values. */
function isStaticCSSObject(node: Node): boolean {
  if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
  const props = node.getProperties();

  for (const prop of props) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;
    const init = prop.getInitializer();
    if (!init || !init.isKind(SyntaxKind.StringLiteral)) return false;
  }
  return props.length > 0;
}

// ─── Entry Extraction ──────────────────────────────────────────

/** A raw CSS declaration extracted from AST. */
interface RawDecl {
  property: string;
  value: string;
}

interface ExtractedEntry {
  kind: 'shorthand' | 'nested';
  value: string;
  selector?: string;
  entries?: string[];
  rawDeclarations?: RawDecl[];
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
        if (!init) continue;

        const nestedEntries: string[] = [];
        const rawDeclarations: RawDecl[] = [];

        if (init.isKind(SyntaxKind.ArrayLiteralExpression)) {
          // Array form: ['shorthand', { 'css-prop': 'value' }]
          for (const el of init.getElements()) {
            if (el.isKind(SyntaxKind.StringLiteral)) {
              nestedEntries.push(el.getLiteralValue());
            } else if (el.isKind(SyntaxKind.ObjectLiteralExpression)) {
              rawDeclarations.push(...extractCSSDeclarations(el));
            }
          }
        } else if (init.isKind(SyntaxKind.ObjectLiteralExpression)) {
          // Direct object form: { 'flex-direction': 'row', ... }
          rawDeclarations.push(...extractCSSDeclarations(init));
        }

        results.push({
          kind: 'nested',
          value: '',
          selector: actualSelector,
          entries: nestedEntries,
          rawDeclarations,
        });
      }
    }
  }

  return results;
}

/** Extract CSS declarations from an object literal: { 'prop': 'value', ... } → RawDecl[] */
function extractCSSDeclarations(node: Node): RawDecl[] {
  if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

  const declarations: RawDecl[] = [];
  for (const prop of node.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
    const init = prop.getInitializer();
    if (!init || !init.isKind(SyntaxKind.StringLiteral)) continue;

    const nameNode = prop.getNameNode();
    const name = nameNode.isKind(SyntaxKind.StringLiteral)
      ? nameNode.getLiteralValue()
      : prop.getName();
    declarations.push({ property: name, value: init.getLiteralValue() });
  }
  return declarations;
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
      if (entry.rawDeclarations) {
        for (const raw of entry.rawDeclarations) {
          nestedDecls.push(`${raw.property}: ${raw.value};`);
        }
      }
      if (nestedDecls.length > 0) {
        if (entry.selector.startsWith('@')) {
          // At-rules (@media, @container, etc.) wrap the class selector inside
          rules.push(formatAtRule(entry.selector, `.${className}`, nestedDecls));
        } else {
          const resolvedSelector = entry.selector.replaceAll('&', `.${className}`);
          rules.push(formatCSSRule(resolvedSelector, nestedDecls));
        }
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

/** Format an at-rule (@media, @container) wrapping a class selector. */
function formatAtRule(atRule: string, classSelector: string, declarations: string[]): string {
  const props = declarations.map((d) => `    ${d}`).join('\n');
  return `${atRule} {\n  ${classSelector} {\n${props}\n  }\n}`;
}

// ─── Shorthand Parser (uses shared token tables) ─────────────

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

// ─── Token Resolver (uses shared token tables) ───────────────

interface CompilerPropertyMapping {
  properties: string[];
  valueType: string;
}

function resolveDeclarations(parsed: ParsedShorthand): string[] | null {
  const { property, value } = parsed;

  // Display keywords
  if (DISPLAY_MAP[property] !== undefined && value === null) {
    return [`display: ${DISPLAY_MAP[property]};`];
  }

  // Non-display keywords (flex-col, relative, uppercase, outline-none, etc.)
  const keyword = KEYWORD_MAP[property];
  if (keyword !== undefined && value === null) {
    return keyword.map((d) => `${d.property}: ${d.value};`);
  }

  const mapping = PROPERTY_MAP[property] as CompilerPropertyMapping | undefined;
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
      const sizeVal = SPACING_SCALE[value] ?? SIZE_KEYWORDS[value] ?? null;
      if (sizeVal !== null) return sizeVal;
      // Fraction dimensions: N/M -> percentage
      {
        const fm = /^(\d+)\/(\d+)$/.exec(value);
        if (fm) {
          const den = Number(fm[2]);
          if (den === 0) return null;
          const pct = (Number(fm[1]) / den) * 100;
          return `${pct % 1 === 0 ? pct : pct.toFixed(6)}%`;
        }
      }
      return null;
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
  // Check for opacity modifier: 'primary/50', 'primary.700/50'
  const opMatch = /^(.+)\/(\d+)$/.exec(value);
  if (opMatch) {
    const colorPart = opMatch[1];
    const opacity = Number(opMatch[2]);
    if (opacity < 0 || opacity > 100) return null;
    const resolved = resolveColorToken(colorPart);
    if (resolved === null) return null;
    return `color-mix(in oklch, ${resolved} ${opacity}%, transparent)`;
  }
  return resolveColorToken(value);
}

function resolveColorToken(token: string): string | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex !== -1) {
    const namespace = token.substring(0, dotIndex);
    const shade = token.substring(dotIndex + 1);
    if (COLOR_NAMESPACES.has(namespace)) {
      return `var(--color-${namespace}-${shade})`;
    }
    return null;
  }
  if (COLOR_NAMESPACES.has(token)) {
    return `var(--color-${token})`;
  }
  if (CSS_COLOR_KEYWORDS.has(token)) return token;
  return null;
}

// ─── Class Name Generation ─────────────────────────────────────

/** Deterministic class name generation (mirrors @vertz/ui class-generator.ts). */
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
