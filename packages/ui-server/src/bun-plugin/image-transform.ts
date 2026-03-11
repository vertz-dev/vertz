/**
 * Image transform — detects <Image> from @vertz/ui with static src
 * and replaces with optimized <picture> + <source> + <img> markup.
 *
 * Uses ts-morph for AST-based detection and MagicString for replacement.
 * Runs pre-compilation (before the JSX compiler) so the output is
 * standard HTML elements the compiler already handles.
 */

import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';

export interface ImageTransformOptions {
  projectRoot: string;
  /** Resolve a static src path to an absolute file path. */
  resolveImagePath: (src: string, sourceFile: string) => string;
  /** Get output URLs for a processed image. */
  getImageOutputPaths: (
    sourcePath: string,
    width: number,
    height: number,
    quality: number,
    fit: string,
  ) => {
    webp1x: string;
    webp2x: string;
    fallback: string;
    fallbackType: string;
  };
}

export interface ImageTransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']> | null;
  transformed: boolean;
}

interface StaticImageProps {
  src: string;
  width: number;
  height: number;
  alt: string;
  class?: string;
  pictureClass?: string;
  style?: string;
  loading?: string;
  decoding?: string;
  fetchpriority?: string;
  priority?: boolean;
  quality?: number;
  fit?: string;
  /** Extra pass-through attributes as key=value strings */
  extraAttrs: string[];
}

/** Escape a string for safe use inside an HTML attribute value (double-quoted). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Transform <Image> components with static src into optimized <picture> markup.
 */
export function transformImages(
  source: string,
  filePath: string,
  options: ImageTransformOptions,
): ImageTransformResult {
  // Fast path: skip files that don't contain <Image
  if (!source.includes('<Image') && !source.includes('Image')) {
    return { code: source, map: null, transformed: false };
  }

  // Find the local binding name for Image from @vertz/ui
  const localName = findImageImportName(source);
  if (!localName) {
    return { code: source, map: null, transformed: false };
  }

  // Parse with ts-morph for reliable AST analysis
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(filePath, source, { overwrite: true });

  // Find all JSX elements matching the local Image binding
  const jsxElements = findImageJsxElements(sourceFile, localName);
  if (jsxElements.length === 0) {
    return { code: source, map: null, transformed: false };
  }

  const s = new MagicString(source);
  let transformed = false;

  // Process from last to first to avoid offset shifts
  const sorted = [...jsxElements].sort((a, b) => b.getStart() - a.getStart());

  for (const element of sorted) {
    const props = extractStaticProps(element, sourceFile);
    if (!props) continue; // Dynamic — skip

    const paths = options.getImageOutputPaths(
      options.resolveImagePath(props.src, filePath),
      props.width,
      props.height,
      props.quality ?? 80,
      props.fit ?? 'cover',
    );

    const resolvedLoading = props.priority ? 'eager' : (props.loading ?? 'lazy');
    const resolvedDecoding = props.priority ? 'sync' : (props.decoding ?? 'async');
    const resolvedFetchpriority = props.priority ? 'high' : props.fetchpriority;

    // Build the <img> attributes — escape user-provided values
    const imgAttrs = [
      `src="${escapeAttr(paths.fallback)}"`,
      `width="${props.width}"`,
      `height="${props.height}"`,
      `alt="${escapeAttr(props.alt)}"`,
      `loading="${escapeAttr(resolvedLoading)}"`,
      `decoding="${escapeAttr(resolvedDecoding)}"`,
    ];
    if (resolvedFetchpriority)
      imgAttrs.push(`fetchpriority="${escapeAttr(resolvedFetchpriority)}"`);
    if (props.class) imgAttrs.push(`class="${escapeAttr(props.class)}"`);
    if (props.style) imgAttrs.push(`style="${escapeAttr(props.style)}"`);
    for (const attr of props.extraAttrs) {
      imgAttrs.push(attr);
    }

    // Build the <picture> wrapper
    const pictureOpen = props.pictureClass
      ? `<picture class="${escapeAttr(props.pictureClass)}">`
      : '<picture>';

    const replacement = [
      pictureOpen,
      `<source srcset="${escapeAttr(paths.webp1x)} 1x, ${escapeAttr(paths.webp2x)} 2x" type="image/webp" />`,
      `<img ${imgAttrs.join(' ')} />`,
      '</picture>',
    ].join('');

    s.overwrite(element.getStart(), element.getEnd(), replacement);
    transformed = true;
  }

  if (!transformed) {
    return { code: source, map: null, transformed: false };
  }

  return {
    code: s.toString(),
    map: s.generateMap({ source: filePath, hires: true }),
    transformed: true,
  };
}

/**
 * Find the local binding name for `Image` imported from `@vertz/ui`.
 * Handles aliased imports: `import { Image as Img } from '@vertz/ui'`
 */
function findImageImportName(source: string): string | null {
  // Quick regex pre-check for the import — avoids ts-morph for files without it
  const importMatch = source.match(
    /import\s*\{[^}]*\bImage\b(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*['"]@vertz\/ui['"]/,
  );
  if (!importMatch) return null;
  return importMatch[1] ?? 'Image';
}

/**
 * Find all JSX self-closing elements matching the given tag name.
 */
function findImageJsxElements(
  sourceFile: ReturnType<Project['createSourceFile']>,
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
 * Extract static props from a JSX element.
 * Returns null if the element has dynamic src, spread props, or non-literal width/height.
 */
function extractStaticProps(
  element: ts.JsxSelfClosingElement,
  sourceFile: ReturnType<Project['createSourceFile']>,
): StaticImageProps | null {
  const attrs = element.attributes;

  // Bail on spread attributes
  for (const attr of attrs.properties) {
    if (ts.isJsxSpreadAttribute(attr)) return null;
  }

  let src: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let alt: string | null = null;
  let className: string | undefined;
  let pictureClass: string | undefined;
  let style: string | undefined;
  let loading: string | undefined;
  let decoding: string | undefined;
  let fetchpriority: string | undefined;
  let priority = false;
  let quality: number | undefined;
  let fit: string | undefined;
  const extraAttrs: string[] = [];

  const KNOWN_PROPS = new Set([
    'src',
    'width',
    'height',
    'alt',
    'class',
    'pictureClass',
    'style',
    'loading',
    'decoding',
    'fetchpriority',
    'priority',
    'quality',
    'fit',
  ]);

  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue;

    const name = attr.name.getText(sourceFile.compilerNode);
    const value = attr.initializer;

    switch (name) {
      case 'src':
        src = extractStaticString(value, sourceFile);
        if (src === null) return null; // Dynamic src — bail
        break;
      case 'width':
        width = extractStaticNumber(value, sourceFile);
        if (width === null) return null; // Non-literal width — bail
        break;
      case 'height':
        height = extractStaticNumber(value, sourceFile);
        if (height === null) return null; // Non-literal height — bail
        break;
      case 'alt':
        alt = extractStaticString(value, sourceFile);
        if (alt === null) return null; // Dynamic alt — bail (need it for HTML)
        break;
      case 'class':
        if (value) {
          className = extractStaticString(value, sourceFile) ?? undefined;
          if (!className) return null; // Dynamic class — bail to avoid silent loss
        }
        break;
      case 'pictureClass':
        if (value) {
          pictureClass = extractStaticString(value, sourceFile) ?? undefined;
          if (!pictureClass) return null; // Dynamic pictureClass — bail
        }
        break;
      case 'style':
        if (value) {
          style = extractStaticString(value, sourceFile) ?? undefined;
          if (!style) return null; // Dynamic style — bail to avoid silent loss
        }
        break;
      case 'loading':
        loading = extractStaticString(value, sourceFile) ?? undefined;
        break;
      case 'decoding':
        decoding = extractStaticString(value, sourceFile) ?? undefined;
        break;
      case 'fetchpriority':
        fetchpriority = extractStaticString(value, sourceFile) ?? undefined;
        break;
      case 'priority':
        // `priority` without a value means `priority={true}` in JSX
        if (!value) {
          priority = true;
        } else {
          const boolVal = extractStaticBoolean(value, sourceFile);
          if (boolVal !== null) priority = boolVal;
        }
        break;
      case 'quality':
        quality = extractStaticNumber(value, sourceFile) ?? undefined;
        break;
      case 'fit':
        fit = extractStaticString(value, sourceFile) ?? undefined;
        break;
      default:
        // Pass-through attribute — extract as key="value" string
        if (!KNOWN_PROPS.has(name)) {
          const strVal = extractStaticString(value, sourceFile);
          if (strVal !== null) {
            extraAttrs.push(`${name}="${escapeAttr(strVal)}"`);
          }
        }
        break;
    }
  }

  if (!src || width === null || height === null || alt === null) {
    return null;
  }

  return {
    src,
    width,
    height,
    alt,
    class: className,
    pictureClass,
    style,
    loading,
    decoding,
    fetchpriority,
    priority,
    quality,
    fit,
    extraAttrs,
  };
}

/**
 * Extract a static string from a JSX attribute value.
 * Handles: `"literal"`, `{"literal"}`, `` {`literal`} `` (no interpolation)
 */
function extractStaticString(
  value: ts.JsxAttributeValue | undefined,
  _sourceFile: ReturnType<Project['createSourceFile']>,
): string | null {
  if (!value) return null;

  // String literal attribute: src="value"
  if (ts.isStringLiteral(value)) {
    return value.text;
  }

  // JSX expression: src={"value"} or src={`value`}
  if (ts.isJsxExpression(value) && value.expression) {
    const expr = value.expression;

    // String literal in expression: src={"value"}
    if (ts.isStringLiteral(expr)) {
      return expr.text;
    }

    // No-substitution template literal: src={`value`}
    if (ts.isNoSubstitutionTemplateLiteral(expr)) {
      return expr.text;
    }
  }

  return null;
}

/**
 * Extract a static number from a JSX attribute value.
 * Handles: `{80}` (numeric literal in JSX expression)
 */
function extractStaticNumber(
  value: ts.JsxAttributeValue | undefined,
  _sourceFile: ReturnType<Project['createSourceFile']>,
): number | null {
  if (!value) return null;

  if (ts.isJsxExpression(value) && value.expression) {
    const expr = value.expression;

    if (ts.isNumericLiteral(expr)) {
      return Number(expr.text);
    }
  }

  return null;
}

/**
 * Extract a static boolean from a JSX attribute value.
 * Handles: `{true}`, `{false}`
 */
function extractStaticBoolean(
  value: ts.JsxAttributeValue | undefined,
  _sourceFile: ReturnType<Project['createSourceFile']>,
): boolean | null {
  if (!value) return null;

  if (ts.isJsxExpression(value) && value.expression) {
    const expr = value.expression;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  }

  return null;
}
