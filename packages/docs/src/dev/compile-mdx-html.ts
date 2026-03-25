// Rehype plugin list — use inline cast at call site to satisfy unified's Pluggable[] type

import { builtinComponents } from '../components';
import { childrenToString } from '../components/children';
import { parseFrontmatter } from '../mdx/frontmatter';
import { rehypeEnhancedCode } from '../mdx/rehype-enhanced-code';
import { escapeHtml } from './escape-html';

const SHIKI_LANGS = ['tsx', 'ts', 'bash', 'json', 'yaml', 'html', 'css', 'diff', 'javascript'];
const SHIKI_THEME = 'github-dark';

let highlighterPromise: Promise<unknown> | null = null;

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

function styleObjectToCss(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';');
}

function propsToAttrs(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value == null || value === false) continue;
    if (value === true) {
      parts.push(` ${key}`);
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      parts.push(` style="${escapeHtml(styleObjectToCss(value as Record<string, string>))}"`);
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

  // Build rehype plugins: Shiki for syntax highlighting, then enhanced code blocks
  // biome-ignore lint/suspicious/noExplicitAny: unified PluggableList requires flexible typing
  const rehypePlugins: any[] = [];

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import('shiki');
      return createHighlighter({
        themes: [SHIKI_THEME],
        langs: SHIKI_LANGS,
      });
    })().catch((err) => {
      highlighterPromise = null;
      throw err;
    });
  }
  const highlighter = await highlighterPromise;
  const { default: rehypeShiki } = await import('@shikijs/rehype');
  // Transformer to preserve meta string and language class through Shiki processing
  const preserveMetaTransformer = {
    name: 'preserve-meta',
    code(
      this: { options: { meta?: { __raw?: string }; lang?: string } },
      node: { properties: Record<string, unknown> },
    ) {
      const meta = this.options.meta?.__raw;
      if (meta) {
        node.properties['data-meta'] = meta;
      }
      const lang = this.options.lang;
      if (lang) {
        const classes = Array.isArray(node.properties.className) ? node.properties.className : [];
        classes.push(`language-${lang}`);
        node.properties.className = classes;
      }
    },
  };

  rehypePlugins.push([
    rehypeShiki,
    {
      highlighter,
      themes: { dark: SHIKI_THEME },
      defaultColor: 'dark',
      transformers: [preserveMetaTransformer],
    },
  ]);
  rehypePlugins.push(rehypeEnhancedCode);

  const compiled = await compile(content, {
    outputFormat: 'function-body',
    development: false,
    rehypePlugins,
  });

  const code = String(compiled);

  const factory = new Function(code);
  const mod = factory({ jsx, jsxs: jsx, jsxDEV: jsx, Fragment }) as {
    default: (props: Record<string, unknown>) => string;
  };

  return mod.default({ components: builtinComponents });
}
