import type { PluggableList } from 'unified';

export interface MdxPluginOptions {
  /** JSX import source for the compiled output. Defaults to '@vertz/ui'. */
  jsxImportSource?: string;
  /** Remark plugins to apply during MDX compilation. */
  remarkPlugins?: PluggableList;
  /** Rehype plugins to apply during MDX compilation. */
  rehypePlugins?: PluggableList;
  /** Whether to extract YAML frontmatter. Defaults to true. */
  remarkFrontmatter?: boolean;
  /**
   * Shiki theme for code fence highlighting.
   * - `string` — single theme name (e.g., 'github-dark')
   * - `{ light: string; dark: string }` — dual theme using CSS variables
   * - `false` — disable syntax highlighting
   * Defaults to 'github-dark'.
   */
  shikiTheme?: string | { light: string; dark: string } | false;
  /** Languages to load for Shiki highlighting. Defaults to ['tsx', 'ts', 'bash', 'json']. */
  shikiLangs?: string[];
}

// Module-level highlighter cache keyed by sorted theme names.
// Avoids re-initializing Shiki WASM + grammar loading on every call.
const highlighterCache = new Map<string, Promise<unknown>>();

function getOrCreateHighlighter(themeNames: string[], shikiLangs: string[]): Promise<unknown> {
  const key = [...themeNames].sort().join(',') + '|' + [...shikiLangs].sort().join(',');
  let promise = highlighterCache.get(key);
  if (!promise) {
    promise = (async () => {
      const { createHighlighter } = await import('shiki');
      return createHighlighter({ themes: themeNames, langs: shikiLangs });
    })().catch((err) => {
      highlighterCache.delete(key);
      throw err;
    });
    highlighterCache.set(key, promise);
  }
  return promise;
}

/**
 * Compile MDX source to a JS module string.
 *
 * Runtime-agnostic — no Bun or Node.js file system access.
 * Takes an MDX source string and returns compiled JavaScript.
 */
export async function compileMdx(source: string, options?: MdxPluginOptions): Promise<string> {
  const jsxImportSource = options?.jsxImportSource ?? '@vertz/ui';
  const enableFrontmatter = options?.remarkFrontmatter !== false;
  const shikiLangs = options?.shikiLangs ?? ['tsx', 'ts', 'bash', 'json'];

  const rawTheme = options?.shikiTheme;
  const isDualTheme = typeof rawTheme === 'object' && rawTheme !== null && 'light' in rawTheme;
  const shikiEnabled = rawTheme !== false;
  const themeNames: string[] = isDualTheme
    ? [rawTheme.light, rawTheme.dark]
    : shikiEnabled
      ? [typeof rawTheme === 'string' ? rawTheme : 'github-dark']
      : [];

  const { compile } = await import('@mdx-js/mdx');

  // Build remark plugins
  const remarkPlugins: PluggableList = [...(options?.remarkPlugins ?? [])];
  if (enableFrontmatter) {
    const { default: remarkFrontmatter } = await import('remark-frontmatter');
    const { default: remarkMdxFrontmatter } = await import('remark-mdx-frontmatter');
    remarkPlugins.push(remarkFrontmatter, remarkMdxFrontmatter);
  }

  // Build rehype plugins
  const rehypePlugins: PluggableList = [...(options?.rehypePlugins ?? [])];
  if (shikiEnabled && themeNames.length > 0) {
    const highlighter = await getOrCreateHighlighter(themeNames, shikiLangs);
    const { default: rehypeShiki } = await import('@shikijs/rehype');

    if (isDualTheme) {
      rehypePlugins.push([
        rehypeShiki,
        {
          highlighter,
          themes: { light: rawTheme.light, dark: rawTheme.dark },
          defaultColor: false,
        },
      ]);
    } else {
      rehypePlugins.push([
        rehypeShiki,
        {
          highlighter,
          themes: { dark: themeNames[0] },
          defaultColor: 'dark',
        },
      ]);
    }
  }

  const compiled = await compile(source, {
    jsxImportSource,
    outputFormat: 'program',
    development: false,
    remarkPlugins,
    rehypePlugins,
  });

  return String(compiled);
}
