import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: [
    '@mdx-js/mdx',
    '@shikijs/rehype',
    'shiki',
    'remark-frontmatter',
    'remark-mdx-frontmatter',
  ],
});
