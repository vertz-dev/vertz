import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: { inferTypes: true },
  external: [
    '@mdx-js/mdx',
    '@shikijs/rehype',
    'shiki',
    'remark-frontmatter',
    'remark-mdx-frontmatter',
  ],
});
