import { parseFrontmatter } from '../mdx/frontmatter';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function childrenToString(children: unknown): string {
  if (children == null || children === false || children === true) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToString).join('');
  return String(children);
}

function propsToAttrs(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value == null || value === false) continue;
    if (value === true) {
      parts.push(` ${key}`);
      continue;
    }
    const attrName = key === 'className' ? 'class' : key;
    parts.push(` ${attrName}="${escapeHtml(String(value))}"`);
  }
  return parts.join('');
}

function jsx(
  type: string | ((props: Record<string, unknown>) => string),
  props: Record<string, unknown> | null,
): string {
  const safeProps = props ?? {};
  if (typeof type === 'function') {
    return type(safeProps);
  }
  const attrs = propsToAttrs(safeProps);
  const children = childrenToString(safeProps.children);
  if (VOID_ELEMENTS.has(type)) {
    return `<${type}${attrs} />`;
  }
  return `<${type}${attrs}>${children}</${type}>`;
}

function Fragment(props: { children?: unknown }): string {
  return childrenToString(props?.children);
}

/**
 * Compile MDX source to an HTML string.
 * Uses @mdx-js/mdx compile with a string-based JSX runtime.
 */
export async function compileMdxToHtml(source: string): Promise<string> {
  if (!source.trim()) return '';

  const { content } = parseFrontmatter(source);
  if (!content.trim()) return '';

  const { compile } = await import('@mdx-js/mdx');

  const compiled = await compile(content, {
    outputFormat: 'function-body',
    development: false,
  });

  const code = String(compiled);

  const factory = new Function(code);
  const mod = factory({ jsx, jsxs: jsx, jsxDEV: jsx, Fragment }) as {
    default: (props: Record<string, unknown>) => string;
  };

  return mod.default({});
}
