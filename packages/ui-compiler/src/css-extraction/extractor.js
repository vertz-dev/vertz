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
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from '@vertz/ui/internals';
import { Project, SyntaxKind, ts } from 'ts-morph';
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
  extract(source, filePath) {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
    });
    const sourceFile = project.createSourceFile(filePath, source);
    const allCssRules = [];
    const allBlockNames = [];
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      const expression = call.getExpression();
      if (!expression.isKind(SyntaxKind.Identifier) || expression.getText() !== 'css') {
        continue;
      }
      const args = call.getArguments();
      if (args.length === 0) continue;
      const firstArg = args[0];
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
function isStaticCSSCall(node) {
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
function isStaticNestedObject(node) {
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
function extractEntries(arrayNode) {
  if (!arrayNode.isKind(SyntaxKind.ArrayLiteralExpression)) return [];
  const results = [];
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
        const nestedEntries = [];
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
function buildCSSRules(className, entries) {
  const rules = [];
  const baseDecls = [];
  const pseudoDecls = new Map();
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
      const nestedDecls = [];
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
function formatCSSRule(selector, declarations) {
  const props = declarations.map((d) => `  ${d}`).join('\n');
  return `${selector} {\n${props}\n}`;
}
function parseShorthand(input) {
  const parts = input.split(':');
  if (parts.length === 1) {
    const [property] = parts;
    return { property, value: null, pseudo: null };
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    if (PSEUDO_PREFIXES.has(a)) {
      return { property: b, value: null, pseudo: PSEUDO_MAP[a] ?? a };
    }
    return { property: a, value: b, pseudo: null };
  }
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (PSEUDO_PREFIXES.has(a)) {
      return { property: b, value: c, pseudo: PSEUDO_MAP[a] ?? a };
    }
  }
  return null;
}
function resolveDeclarations(parsed) {
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
function resolveValue(value, valueType, property) {
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
function resolveColor(value) {
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
  if (CSS_COLOR_KEYWORDS.has(value)) return value;
  return null;
}
// ─── Class Name Generation ─────────────────────────────────────
/** Deterministic class name generation (mirrors @vertz/ui class-generator.ts). */
function generateClassName(filePath, blockName) {
  const input = `${filePath}::${blockName}`;
  const hash = djb2Hash(input);
  return `_${hash}`;
}
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
//# sourceMappingURL=extractor.js.map
