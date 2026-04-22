/**
 * Shiki configuration for the blog. Single-theme (vitesse-dark) to match
 * the dark-only landing. Phase 4 extends the `transformers` array with
 * notation / diff / meta-string parsers.
 */
export const BLOG_SHIKI_THEME = 'vitesse-dark';

export const BLOG_SHIKI_LANGS = [
  'tsx',
  'ts',
  'bash',
  'json',
  'diff',
  'html',
  'css',
  'javascript',
  'yaml',
  'rust',
] as const;

export interface ShikiOptions {
  theme: string;
  transformers: unknown[];
}

export const shikiOptions: ShikiOptions = {
  theme: BLOG_SHIKI_THEME,
  transformers: [],
};
