import type MagicString from 'magic-string';
import type { SourceFile } from 'ts-morph';
import { ts } from 'ts-morph';

/**
 * Inject stable IDs into <Island> JSX elements.
 *
 * Detects `<Island component={ComponentName} ... />` patterns and injects
 * an `id` prop derived from the file path and component name. This removes
 * the need for developers to manually specify island IDs.
 *
 * ID format: `filePath::ComponentName` — unique because file paths are unique
 * and component references are unique within a file's usage context.
 *
 * Only injects when:
 * - The `Island` import comes from `@vertz/ui`
 * - The element doesn't already have an `id` prop (manual override)
 * - The `component` prop is a static identifier (not a dynamic expression)
 */
export function injectIslandIds(
  source: MagicString,
  sourceFile: SourceFile,
  relFilePath: string,
): void {
  const originalSource = source.original;

  // Fast path: skip files without <Island
  if (!originalSource.includes('<Island') && !originalSource.includes('Island')) {
    return;
  }

  // Find the local binding name for Island from @vertz/ui
  const localName = findIslandImportName(originalSource);
  if (!localName) return;

  // Find all JSX elements matching the local Island binding
  const jsxElements = findIslandJsxElements(sourceFile, localName);
  if (jsxElements.length === 0) return;

  const escapedPath = relFilePath.replace(/['\\]/g, '\\$&');

  for (const element of jsxElements) {
    // Skip if the element already has an `id` prop
    if (hasIdProp(element, sourceFile)) continue;

    // Extract the component name from the `component` prop
    const componentName = extractComponentName(element, sourceFile);
    if (!componentName) continue;

    const stableId = `${escapedPath}::${componentName}`;

    // Inject `id="stableId"` after the tag name
    const tagName = element.tagName;
    const tagEnd = tagName.end;
    source.appendLeft(tagEnd, ` id="${stableId}"`);
  }
}

/**
 * Find the local binding name for `Island` imported from `@vertz/ui`.
 * Handles aliased imports: `import { Island as Isl } from '@vertz/ui'`
 */
function findIslandImportName(source: string): string | null {
  const importMatch = source.match(
    /import\s*\{[^}]*\bIsland\b(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*['"]@vertz\/ui['"]/,
  );
  if (!importMatch) return null;
  return importMatch[1] ?? 'Island';
}

/**
 * Find all JSX self-closing elements matching the given tag name.
 */
function findIslandJsxElements(
  sourceFile: SourceFile,
  localName: string,
): ts.JsxSelfClosingElement[] {
  const results: ts.JsxSelfClosingElement[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile.compilerNode);
      if (tagName === localName) {
        results.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile.compilerNode);
  return results;
}

/**
 * Check if the JSX element already has an `id` prop.
 */
function hasIdProp(element: ts.JsxSelfClosingElement, sourceFile: SourceFile): boolean {
  for (const attr of element.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const name = attr.name.getText(sourceFile.compilerNode);
      if (name === 'id') return true;
    }
  }
  return false;
}

/**
 * Extract the component name from the `component` prop.
 * Returns null if the prop is missing or not a static identifier.
 *
 * Handles: `component={CopyButton}` → "CopyButton"
 */
function extractComponentName(
  element: ts.JsxSelfClosingElement,
  sourceFile: SourceFile,
): string | null {
  for (const attr of element.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;

    const name = attr.name.getText(sourceFile.compilerNode);
    if (name !== 'component') continue;

    const value = attr.initializer;
    if (!value) return null;

    // component={Identifier}
    if (ts.isJsxExpression(value) && value.expression) {
      if (ts.isIdentifier(value.expression)) {
        return value.expression.text;
      }
    }

    return null;
  }

  return null;
}
