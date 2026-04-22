#!/usr/bin/env bun
/**
 * Compiles every .mdx file in content/blog/ into a .js module under
 * src/blog/.generated/posts/ and emits a manifest.ts that imports them all
 * along with the author JSON files.
 *
 * The vtz app build pipeline (see packages/cli/src/production-build) does not
 * expose a user-plugin extension point today, so we dogfood @vertz/mdx by
 * calling compileMdx() ahead of the main build instead of wiring a plugin.
 *
 * Regenerated on every `bun run build`; during `vtz dev` developers rerun
 * `bun run build:blog` after editing posts (see package.json).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { compileMdx } from '@vertz/mdx';
import type { RawFrontmatter } from '../src/blog/types';

interface CompiledPostEntry {
  /** Slug derived from filename (may be overridden by frontmatter.slug). */
  fileSlug: string;
  /** Sanitized identifier for import statements. */
  importName: string;
  /** Relative path used in the manifest import. */
  importPath: string;
  frontmatter: RawFrontmatter;
  wordCount: number;
}

function toImportName(slug: string): string {
  // Convert a slug into a safe JS identifier.
  return `Post_${slug.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function countWords(mdx: string): number {
  const bodyOnly = mdx.replace(/^---[\s\S]*?---/m, '');
  const stripped = bodyOnly
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

type RawFrontmatterValue = string | boolean | string[];

function requireString(fm: Record<string, RawFrontmatterValue>, key: string): string {
  const v = fm[key];
  if (typeof v !== 'string' || !v) {
    throw new Error(`Frontmatter missing required string field "${key}"`);
  }
  return v;
}

function parseYamlFrontmatter(source: string): { frontmatter: RawFrontmatter; rest: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing YAML frontmatter (expected --- block at top of file)');
  }
  const yaml = match[1] ?? '';
  const rest = match[2] ?? '';
  const fm: Record<string, RawFrontmatterValue> = {};
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    if (value === 'true' || value === 'false') {
      fm[key] = value === 'true';
      continue;
    }
    value = value.replace(/^['"]|['"]$/g, '');
    fm[key] = value;
  }

  const frontmatter: RawFrontmatter = {
    title: requireString(fm, 'title'),
    date: requireString(fm, 'date'),
    author: requireString(fm, 'author'),
    description: requireString(fm, 'description'),
  };
  if (typeof fm.slug === 'string') frontmatter.slug = fm.slug;
  if (typeof fm.cover === 'string') frontmatter.cover = fm.cover;
  if (Array.isArray(fm.tags)) frontmatter.tags = fm.tags;
  if (typeof fm.draft === 'boolean') frontmatter.draft = fm.draft;
  return { frontmatter, rest };
}

export interface CompileBlogOptions {
  projectRoot: string;
  contentDir?: string;
  outputDir?: string;
  manifestPath?: string;
  authorsDir?: string;
}

export async function compileBlog(options: CompileBlogOptions): Promise<{
  postCount: number;
  authorCount: number;
}> {
  const projectRoot = options.projectRoot;
  const contentDir = options.contentDir ?? join(projectRoot, 'content', 'blog');
  const outputDir = options.outputDir ?? join(projectRoot, 'src', 'blog', '.generated', 'posts');
  const manifestPath =
    options.manifestPath ?? join(projectRoot, 'src', 'blog', '.generated', 'manifest.ts');
  const authorsDir = options.authorsDir ?? join(contentDir, 'authors');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(dirname(manifestPath), { recursive: true });

  const posts: CompiledPostEntry[] = [];

  if (existsSync(contentDir)) {
    for (const entry of readdirSync(contentDir)) {
      if (extname(entry) !== '.mdx') continue;
      const filePath = join(contentDir, entry);
      const source = readFileSync(filePath, 'utf-8');
      const { frontmatter, rest } = parseYamlFrontmatter(source);
      const wordCount = countWords(rest);

      // Slug = filename without `.mdx`, ignoring leading YYYY-MM-DD- prefix.
      const baseName = basename(entry, '.mdx');
      const fileSlug = baseName.replace(/^\d{4}-\d{2}-\d{2}-/, '');

      const compiled = await compileMdx(source, {
        jsxImportSource: '@vertz/ui',
        shikiTheme: 'vitesse-dark',
        shikiLangs: ['tsx', 'ts', 'bash', 'json', 'diff', 'html', 'css'],
      });

      const outFile = join(outputDir, `${baseName}.js`);
      writeFileSync(outFile, compiled);

      // Emit a companion .d.ts so the manifest can import the compiled JS
      // module under `noImplicitAny`. The type mirrors PostComponent from
      // ../types.ts — we can't share a generic wildcard because relative
      // module wildcards don't cover concrete paths in ambient declarations.
      const dtsFile = join(outputDir, `${baseName}.d.ts`);
      writeFileSync(
        dtsFile,
        [
          '// AUTO-GENERATED by scripts/compile-blog-posts.ts — do not edit by hand.',
          'declare const Component: (',
          '  props?: Record<string, unknown>,',
          ') => HTMLElement | SVGElement | DocumentFragment;',
          'export default Component;',
          'export const frontmatter: Record<string, unknown>;',
          '',
        ].join('\n'),
      );

      const importPath = `./posts/${baseName}.js`;
      posts.push({
        fileSlug,
        importName: toImportName(baseName),
        importPath,
        frontmatter,
        wordCount,
      });
    }
  }

  posts.sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));

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
  ];

  for (const post of posts) {
    manifestLines.push(`import ${post.importName} from '${post.importPath}';`);
  }

  manifestLines.push('');
  manifestLines.push('export const generatedPosts: GeneratedPost[] = [');
  for (const post of posts) {
    const fmJson = JSON.stringify(post.frontmatter);
    manifestLines.push(`  {`);
    manifestLines.push(`    slug: ${JSON.stringify(post.fileSlug)},`);
    manifestLines.push(`    wordCount: ${post.wordCount},`);
    manifestLines.push(`    frontmatter: ${fmJson},`);
    manifestLines.push(`    Component: ${post.importName},`);
    manifestLines.push(`  },`);
  }
  manifestLines.push('];');
  manifestLines.push('');
  manifestLines.push('export const generatedAuthors: AuthorManifest = ');
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
