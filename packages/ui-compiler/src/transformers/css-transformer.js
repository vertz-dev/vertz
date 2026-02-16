/**
 * CSS Transformer -- Replace static css() calls with class name references
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
import { SyntaxKind } from 'ts-morph';
/**
 * Transform static css() calls in the source.
 */
export class CSSTransformer {
  transform(s, sourceFile, cssCalls, filePath) {
    const allCssRules = [];
    const classNameMaps = new Map();
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
  processStaticCall(sourceFile, call, filePath) {
    // Use the css() runtime to do the heavy lifting.
    // We need to parse the AST to extract the actual shorthand values.
    const classNames = {};
    const cssRules = [];
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
  buildReplacement(classNames) {
    const entries = Object.entries(classNames)
      .map(([name, className]) => `${name}: '${className}'`)
      .join(', ');
    return `{ ${entries} }`;
  }
}
function findCallAtPosition(sourceFile, start) {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (call.getStart() === start) return call;
  }
  return null;
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
        // Handle quoted property names (e.g. '&::after')
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
// ─── Class Name Generation (mirrors @vertz/ui class-generator.ts) ──────
/** Deterministic class name generation. */
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
/** Build CSS rules from extracted entries. */
function buildCSSRules(className, entries) {
  const rules = [];
  const baseDecls = [];
  const pseudoDecls = new Map();
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
      const nestedDecls = [];
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
function formatCSSRule(selector, declarations) {
  const props = declarations.map((d) => `  ${d}`).join('\n');
  return `${selector} {\n${props}\n}`;
}
function parseShorthandInline(input) {
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
function resolveInline(parsed) {
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
function resolveValueInline(value, valueType, property) {
  switch (valueType) {
    case 'spacing':
      return SPACING_SCALE[value] ?? null;
    case 'color':
      return resolveColorInline(value);
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
function resolveColorInline(value) {
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
//# sourceMappingURL=css-transformer.js.map
