import type { BunPlugin } from 'bun';
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
  /** Shiki theme for code fence highlighting. Set to false to disable. Defaults to 'github-dark'. */
  shikiTheme?: string | false;
  /** Languages to load for Shiki highlighting. Defaults to ['tsx', 'ts', 'bash', 'json']. */
  shikiLangs?: string[];
}

/**
 * Create a Bun plugin that compiles `.mdx` files to Vertz-compatible JS modules.
 *
 * Uses `@mdx-js/mdx` for compilation with:
 * - `jsxImportSource` targeting Vertz's JSX runtime (client or server)
 * - Frontmatter extraction via remark-frontmatter + remark-mdx-frontmatter
 * - Code fence highlighting via @shikijs/rehype + Shiki
 */
export function createMdxPlugin(options?: MdxPluginOptions): BunPlugin {
  const jsxImportSource = options?.jsxImportSource ?? '@vertz/ui';
  const enableFrontmatter = options?.remarkFrontmatter !== false;
  const shikiTheme = options?.shikiTheme !== false ? (options?.shikiTheme ?? 'github-dark') : false;
  const shikiLangs = options?.shikiLangs ?? ['tsx', 'ts', 'bash', 'json'];

  // Shared highlighter instance — created lazily on first .mdx load
  let highlighterPromise: Promise<unknown> | null = null;

  return {
    name: 'vertz-mdx',
    setup(build) {
      build.onLoad({ filter: /\.mdx$/ }, async (args) => {
        const source = await Bun.file(args.path).text();
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
        if (shikiTheme) {
          // Create shared highlighter on first use
          if (!highlighterPromise) {
            highlighterPromise = (async () => {
              const { createHighlighter } = await import('shiki');
              return createHighlighter({
                themes: [shikiTheme],
                langs: shikiLangs,
              });
            })().catch((err) => {
              highlighterPromise = null;
              throw err;
            });
          }
          const highlighter = await highlighterPromise;
          const { default: rehypeShiki } = await import('@shikijs/rehype');
          rehypePlugins.push([
            rehypeShiki,
            { highlighter, themes: { dark: shikiTheme }, defaultColor: 'dark' },
          ]);
        }

        const compiled = await compile(source, {
          jsxImportSource,
          outputFormat: 'program',
          development: false,
          remarkPlugins,
          rehypePlugins,
        });

        return {
          contents: String(compiled),
          loader: 'js',
        };
      });
    },
  };
}
