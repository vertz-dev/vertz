/**
 * Compiles every .mdx file in content/blog/ into a pre-rendered HTML string
 * and emits a manifest.ts that wires each post's frontmatter + HTML together
 * alongside the author JSON files.
 *
 * Why HTML + innerHTML instead of a JSX component?
 * The `@vertz/ui` SSR pipeline (Vertz compiler → `__element` calls) cannot
 * mix a `DocumentFragment` produced by `@vertz/ui/jsx-runtime` into its own
 * tree — the serializer falls back to `String(children)` → "[object Object]".
 * Phase 4 (MDX component overrides) will revisit this with a shared runtime;
 * for Phase 1 we render the post body via `innerHTML` which works in both
 * SSR and the client. The dogfood path still uses `@vertz/mdx`'s unified
 * pipeline (Shiki + remark-frontmatter) — just with a tiny string-emitting
 * JSX shim similar to `packages/docs/src/dev/compile-mdx-html.ts`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { RawFrontmatter } from '../src/blog/types';

interface CompiledPostEntry {
  /** Slug derived from filename (may be overridden by frontmatter.slug). */
  fileSlug: string;
  frontmatter: RawFrontmatter;
  wordCount: number;
  html: string;
}

// ── Word counter ─────────────────────────────────────────────

export function countWords(mdx: string): number {
  const bodyOnly = mdx.replace(/^---[\s\S]*?---/m, '');
  const stripped = bodyOnly
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

// ── Frontmatter extraction ────────────────────────────────────

function requireString(fm: Record<string, unknown>, key: string): string {
  const v = fm[key];
  if (typeof v !== 'string' || !v) {
    throw new Error(`Frontmatter missing required string field "${key}"`);
  }
  return v;
}

export function toRawFrontmatter(fm: Record<string, unknown>): RawFrontmatter {
  const frontmatter: RawFrontmatter = {
    title: requireString(fm, 'title'),
    date: requireString(fm, 'date'),
    author: requireString(fm, 'author'),
    description: requireString(fm, 'description'),
  };
  if (typeof fm.slug === 'string') frontmatter.slug = fm.slug;
  if (typeof fm.cover === 'string') frontmatter.cover = fm.cover;
  if (Array.isArray(fm.tags)) {
    frontmatter.tags = fm.tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof fm.draft === 'boolean') frontmatter.draft = fm.draft;
  return frontmatter;
}

/**
 * Extracts the `frontmatter` export from a compiled MDX module string.
 * `@mdx-js/mdx` + `remark-mdx-frontmatter` emits it as a JSON-literal
 * object we can parse without ever executing the module.
 */
export function extractCompiledFrontmatter(compiledJs: string): Record<string, unknown> {
  const match = compiledJs.match(/export\s+const\s+frontmatter\s*=\s*(\{[\s\S]*?\n\})\s*;?/);
  if (!match || !match[1]) {
    throw new Error(
      'Compiled MDX module has no `export const frontmatter = {...}`. ' +
        'Every post must start with a YAML `---` block.',
    );
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error("Compiled MDX 'frontmatter' is not a plain object");
  }
  return parsed as Record<string, unknown>;
}

// ── String-emitting JSX shim ─────────────────────────────────

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function styleObjectToCss(style: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === false) continue;
    // camelCase → kebab-case (backgroundColor → background-color).
    const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    parts.push(`${prop}:${v}`);
  }
  return parts.join(';');
}

function propsToAttrs(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'dangerouslySetInnerHTML' || value == null || value === false)
      continue;
    if (value === true) {
      parts.push(` ${key}`);
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      const css = styleObjectToCss(value as Record<string, unknown>);
      if (css) parts.push(` style="${escapeHtml(css)}"`);
      continue;
    }
    const attrName = key === 'className' ? 'class' : key;
    parts.push(` ${attrName}="${escapeHtml(String(value))}"`);
  }
  return parts.join('');
}

/**
 * Branded HTML-fragment returned by `stringJsx` and `stringFragment` so
 * `childrenHtml` can distinguish raw MDX text nodes (which need escaping to
 * avoid author-written `<slug>` corrupting the output) from already-rendered
 * JSX subtrees (which must pass through verbatim).
 */
interface HtmlFragment {
  __html: string;
}

function isHtmlFragment(v: unknown): v is HtmlFragment {
  return (
    typeof v === 'object' && v !== null && typeof (v as { __html?: unknown }).__html === 'string'
  );
}

function html(s: string): HtmlFragment {
  return { __html: s };
}

function childrenHtml(children: unknown): string {
  if (children == null || children === false || children === true) return '';
  if (Array.isArray(children)) return children.map(childrenHtml).join('');
  if (isHtmlFragment(children)) return children.__html;
  if (typeof children === 'string') return escapeHtml(children);
  if (typeof children === 'number') return escapeHtml(String(children));
  return '';
}

type StringJsxFn = (
  type: string | ((props: Record<string, unknown>) => HtmlFragment | string),
  props: Record<string, unknown> | null,
) => HtmlFragment;

const stringJsx: StringJsxFn = (type, props) => {
  const safeProps = props ?? {};
  if (typeof type === 'function') {
    const result = type(safeProps);
    return typeof result === 'string' ? html(result) : result;
  }
  const attrs = propsToAttrs(safeProps);
  const inner = safeProps.dangerouslySetInnerHTML
    ? String((safeProps.dangerouslySetInnerHTML as { __html?: string }).__html ?? '')
    : childrenHtml(safeProps.children);
  if (VOID_ELEMENTS.has(type)) return html(`<${type}${attrs} />`);
  return html(`<${type}${attrs}>${inner}</${type}>`);
};

function stringFragment(props: { children?: unknown }): HtmlFragment {
  return html(childrenHtml(props?.children));
}

// ── MDX → HTML pipeline ──────────────────────────────────────

let highlighterPromise: Promise<unknown> | null = null;

async function getHighlighter(): Promise<unknown> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import('shiki');
      return createHighlighter({
        themes: ['vitesse-dark'],
        langs: ['tsx', 'ts', 'bash', 'json', 'diff', 'html', 'css'],
      });
    })().catch((err) => {
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
}

export async function compileMdxSourceToHtml(source: string): Promise<string> {
  const body = source.replace(/^---\n[\s\S]*?\n---\n?/, '');
  if (!body.trim()) return '';

  const { compile } = await import('@mdx-js/mdx');
  const rehypeShiki = (await import('@shikijs/rehype')).default;
  const remarkGfm = (await import('remark-gfm')).default;
  const highlighter = await getHighlighter();

  // unified's PluggableList typing is very loose; use a local alias rather than
  // a double-cast so oxlint/no-double-cast stays happy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rehypePlugins: any[] = [
    [rehypeShiki, { highlighter, themes: { dark: 'vitesse-dark' }, defaultColor: 'dark' }],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remarkPlugins: any[] = [remarkGfm];

  const compiled = await compile(body, {
    outputFormat: 'function-body',
    development: false,
    remarkPlugins,
    rehypePlugins,
  });

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(String(compiled));
  const mod = factory({
    jsx: stringJsx,
    jsxs: stringJsx,
    jsxDEV: stringJsx,
    Fragment: stringFragment,
  }) as { default: (props: Record<string, unknown>) => HtmlFragment | string };

  const { Callout } = await import('../src/blog/mdx/custom/callout');
  const { Figure } = await import('../src/blog/mdx/custom/figure');
  const { Terminal } = await import('../src/blog/mdx/custom/terminal');
  const { Badge } = await import('../src/blog/mdx/custom/badge');
  const { Keyboard } = await import('../src/blog/mdx/custom/keyboard');
  const rendered = mod.default({
    components: { Callout, Figure, Terminal, Badge, Keyboard },
  });
  const raw = typeof rendered === 'string' ? rendered : rendered.__html;
  return postProcessBlogHtml(raw);
}

/**
 * Post-process the rendered HTML:
 *   - Slugify every `<h2>` / `<h3>` without an explicit `id` so the TOC, the
 *     rendered page, and any external deep-links agree on the anchor target.
 *   - Append a `<a class="heading-anchor" href="#id">#</a>` child after the
 *     heading text so readers can copy direct links on hover.
 *   - Tag external `<a>` elements (href starts with `http` and not `vertz.dev`)
 *     with `target="_blank" rel="noopener noreferrer"` and a `↗` glyph.
 *   - Wrap every `<table>` in a `<div class="table-scroll">` so wide columns
 *     scroll rather than overflow the prose container.
 */
export function postProcessBlogHtml(rawHtml: string): string {
  let out = injectHeadingIds(rawHtml);
  out = injectHeadingAnchors(out);
  out = markExternalLinks(out);
  out = wrapTables(out);
  return out;
}

export function injectHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(
    /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_full, levelStr: string, attrsRaw: string | undefined, inner: string) => {
      const attrs = attrsRaw ?? '';
      if (/\bid\s*=/.test(attrs)) {
        return `<h${levelStr}${attrs}>${inner}</h${levelStr}>`;
      }
      const text = inner.replace(/<[^>]+>/g, '').trim();
      const baseId = slugifyHeading(text);
      if (!baseId) return `<h${levelStr}${attrs}>${inner}</h${levelStr}>`;
      const count = seen.get(baseId) ?? 0;
      const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
      seen.set(baseId, count + 1);
      return `<h${levelStr}${attrs} id="${id}">${inner}</h${levelStr}>`;
    },
  );
}

/** Appends a `#` anchor-link child to every h2/h3/h4 that has an `id`. */
export function injectHeadingAnchors(html: string): string {
  return html.replace(
    /<h([234])([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_full, levelStr: string, attrs: string, id: string, inner: string) => {
      if (inner.includes('class="heading-anchor"')) {
        return `<h${levelStr}${attrs}>${inner}</h${levelStr}>`;
      }
      const anchor = `<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a>`;
      return `<h${levelStr}${attrs}>${inner}${anchor}</h${levelStr}>`;
    },
  );
}

/**
 * Mark `<a>` elements whose href points outside vertz.dev with target / rel
 * safety attributes + a trailing `↗` glyph so readers know they're leaving
 * the site. Leaves anchors without `href` (e.g. heading anchors with only
 * a fragment) untouched.
 */
export function markExternalLinks(html: string): string {
  return html.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (_full, pre: string, href: string, post: string, inner: string) => {
      const isExternal =
        /^https?:\/\//i.test(href) && !/^https?:\/\/([^/]+\.)?vertz\.dev(\/|$)/i.test(href);
      if (!isExternal) return `<a ${pre}href="${href}"${post}>${inner}</a>`;
      const hasTarget = /\btarget=/.test(pre + post);
      const hasRel = /\brel=/.test(pre + post);
      const targetAttr = hasTarget ? '' : ' target="_blank"';
      const relAttr = hasRel ? '' : ' rel="noopener noreferrer"';
      const marker = '<span aria-hidden="true" class="external-link-icon"> ↗</span>';
      return `<a ${pre}href="${href}"${post}${targetAttr}${relAttr} data-external="true">${inner}${marker}</a>`;
    },
  );
}

/** Wraps every table in a horizontally-scrollable div. */
export function wrapTables(html: string): string {
  return html.replace(/<table([\s\S]*?)<\/table>/gi, (m) => `<div class="table-scroll">${m}</div>`);
}

function decodeEntitiesForSlug(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function slugifyHeading(input: string): string {
  return decodeEntitiesForSlug(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Compile a single .mdx file using `@vertz/mdx` to also get the parsed
 * frontmatter — then render the body to HTML through the string shim above.
 */
async function compileSinglePost(source: string): Promise<{
  frontmatter: Record<string, unknown>;
  html: string;
}> {
  const { compileMdx } = await import('@vertz/mdx');
  // First pass: dogfood @vertz/mdx to validate parsing + pull frontmatter.
  const compiledJs = await compileMdx(source, {
    jsxImportSource: '@vertz/ui',
    shikiTheme: false, // keep this step fast; syntax highlighting happens in the HTML pass
  });
  const frontmatter = extractCompiledFrontmatter(compiledJs);
  const html = await compileMdxSourceToHtml(source);
  return { frontmatter, html };
}

// ── Main compile orchestrator ────────────────────────────────

export interface CompileBlogOptions {
  projectRoot: string;
  contentDir?: string;
  manifestPath?: string;
  authorsDir?: string;
}

export async function compileBlog(options: CompileBlogOptions): Promise<{
  postCount: number;
  authorCount: number;
}> {
  const projectRoot = options.projectRoot;
  const contentDir = options.contentDir ?? join(projectRoot, 'content', 'blog');
  const manifestPath =
    options.manifestPath ?? join(projectRoot, 'src', 'blog', '.generated', 'manifest.ts');
  const authorsDir = options.authorsDir ?? join(contentDir, 'authors');

  mkdirSync(dirname(manifestPath), { recursive: true });

  const posts: CompiledPostEntry[] = [];

  if (existsSync(contentDir)) {
    for (const entry of readdirSync(contentDir)) {
      if (extname(entry) !== '.mdx') continue;
      const filePath = join(contentDir, entry);
      const source = readFileSync(filePath, 'utf-8');
      const wordCount = countWords(source);

      const baseName = basename(entry, '.mdx');
      const fileSlug = baseName.replace(/^\d{4}-\d{2}-\d{2}-/, '');

      const { frontmatter: rawFm, html } = await compileSinglePost(source);
      const frontmatter = toRawFrontmatter(rawFm);

      posts.push({ fileSlug, frontmatter, wordCount, html });
    }
  }

  posts.sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));

  const authors: Record<string, unknown> = {};
  if (existsSync(authorsDir)) {
    for (const entry of readdirSync(authorsDir)) {
      if (extname(entry) !== '.json') continue;
      const key = basename(entry, '.json');
      const data = JSON.parse(readFileSync(join(authorsDir, entry), 'utf-8'));
      authors[key] = data;
    }
  }

  const manifestLines: string[] = [
    '// AUTO-GENERATED by scripts/compile-blog-posts.ts — do not edit by hand.',
    '// Regenerated on every blog build.',
    '',
    "import type { AuthorManifest, GeneratedPost } from '../types';",
    '',
    'export const generatedPosts: GeneratedPost[] = [',
  ];
  for (const post of posts) {
    const fmJson = JSON.stringify(post.frontmatter);
    manifestLines.push(`  {`);
    manifestLines.push(`    slug: ${JSON.stringify(post.fileSlug)},`);
    manifestLines.push(`    wordCount: ${post.wordCount},`);
    manifestLines.push(`    frontmatter: ${fmJson},`);
    manifestLines.push(`    html: ${JSON.stringify(post.html)},`);
    manifestLines.push(`  },`);
  }
  manifestLines.push('];');
  manifestLines.push('');
  manifestLines.push('export const generatedAuthors: AuthorManifest =');
  manifestLines.push(`  ${JSON.stringify(authors, null, 2)};`);
  manifestLines.push('');

  writeFileSync(manifestPath, manifestLines.join('\n'));

  return { postCount: posts.length, authorCount: Object.keys(authors).length };
}

// Script entrypoint — `bun scripts/compile-blog-posts.ts`.
if (import.meta.main) {
  const projectRoot = resolve(import.meta.dir, '..');
  const start = performance.now();
  compileBlog({ projectRoot })
    .then(({ postCount, authorCount }) => {
      const ms = Math.round(performance.now() - start);
      console.log(
        `📝 Compiled ${postCount} blog post${postCount === 1 ? '' : 's'} and ${authorCount} author${authorCount === 1 ? '' : 's'} in ${ms}ms`,
      );
    })
    .catch((err) => {
      console.error('❌ Blog compile failed:');
      console.error(err instanceof Error ? (err.stack ?? err.message) : err);
      process.exit(1);
    });
}
