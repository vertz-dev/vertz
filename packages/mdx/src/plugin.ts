import { readFile } from 'node:fs/promises';
import type { MdxPluginOptions } from './compile-mdx';
import { compileMdx } from './compile-mdx';

/** Minimal plugin interface compatible with Bun's build plugin system. */
export interface MdxPlugin {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{ contents: string; loader: string }>,
    ): void;
  }): void;
}

/**
 * Create a build plugin that compiles `.mdx` files to Vertz-compatible JS modules.
 *
 * Uses `@mdx-js/mdx` for compilation with:
 * - `jsxImportSource` targeting Vertz's JSX runtime (client or server)
 * - Frontmatter extraction via remark-frontmatter + remark-mdx-frontmatter
 * - Code fence highlighting via @shikijs/rehype + Shiki
 */
export function createMdxPlugin(options?: MdxPluginOptions): MdxPlugin {
  return {
    name: 'vertz-mdx',
    setup(build) {
      build.onLoad({ filter: /\.mdx$/ }, async (args) => {
        const source = await readFile(args.path, 'utf-8');
        const contents = await compileMdx(source, options);

        return {
          contents,
          loader: 'js',
        };
      });
    },
  };
}
