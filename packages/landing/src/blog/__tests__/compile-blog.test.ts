import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@vertz/test';
import { compileBlog, countWords, toRawFrontmatter } from '../../../scripts/compile-blog-posts';

function makeTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'vertz-blog-test-'));
  mkdirSync(join(root, 'content', 'blog'), { recursive: true });
  mkdirSync(join(root, 'content', 'blog', 'authors'), { recursive: true });
  return root;
}

function writePost(projectRoot: string, filename: string, body: string): void {
  writeFileSync(join(projectRoot, 'content', 'blog', filename), body);
}

function writeAuthor(projectRoot: string, key: string, data: Record<string, unknown>): void {
  writeFileSync(
    join(projectRoot, 'content', 'blog', 'authors', `${key}.json`),
    JSON.stringify(data),
  );
}

async function compileInto(projectRoot: string) {
  const manifestPath = join(projectRoot, 'out', 'manifest.ts');
  return compileBlog({
    projectRoot,
    contentDir: join(projectRoot, 'content', 'blog'),
    authorsDir: join(projectRoot, 'content', 'blog', 'authors'),
    manifestPath,
  });
}

describe('Feature: Blog compile script', () => {
  describe('Given countWords', () => {
    describe('When called on an MDX body with a fenced code block', () => {
      it('then strips the fenced block before counting', () => {
        const mdx = [
          '---',
          'title: T',
          '---',
          'one two three',
          '```ts',
          'const skipped = 1;',
          'const alsoSkipped = 2;',
          '```',
          'four five',
        ].join('\n');
        expect(countWords(mdx)).toBe(5);
      });
    });

    describe('When called on MDX with JSX tags and markdown symbols', () => {
      it('then tags and syntax markers are dropped', () => {
        const mdx = '## Heading\n\nHello <Callout type="warn">world</Callout> now';
        expect(countWords(mdx)).toBe(4);
      });
    });

    describe('When called on an empty body', () => {
      it('then returns 0', () => {
        expect(countWords('---\ntitle: T\n---\n')).toBe(0);
      });
    });
  });

  describe('Given toRawFrontmatter', () => {
    describe('When all required fields are present', () => {
      it('then maps required fields and carries optional ones', () => {
        const fm = toRawFrontmatter({
          title: 'T',
          date: '2026-04-22',
          author: 'matheus',
          description: 'D',
          slug: 'custom',
          cover: '/c.png',
          tags: ['a', 'b'],
          draft: true,
        });
        expect(fm).toEqual({
          title: 'T',
          date: '2026-04-22',
          author: 'matheus',
          description: 'D',
          slug: 'custom',
          cover: '/c.png',
          tags: ['a', 'b'],
          draft: true,
        });
      });
    });

    describe('When a required field is missing', () => {
      it('then throws with the missing key in the message', () => {
        expect(() =>
          toRawFrontmatter({
            date: '2026-04-22',
            author: 'matheus',
            description: 'D',
          }),
        ).toThrow(/title/);
      });
    });

    describe('When tags is not an array', () => {
      it('then tags is omitted', () => {
        const fm = toRawFrontmatter({
          title: 'T',
          date: '2026-04-22',
          author: 'matheus',
          description: 'D',
          tags: 'not-an-array',
        });
        expect(fm.tags).toBeUndefined();
      });
    });

    describe('When tags contains non-strings', () => {
      it('then non-strings are filtered out', () => {
        const fm = toRawFrontmatter({
          title: 'T',
          date: '2026-04-22',
          author: 'matheus',
          description: 'D',
          tags: ['ok', 42, null, 'also-ok'],
        });
        expect(fm.tags).toEqual(['ok', 'also-ok']);
      });
    });
  });

  describe('Given an empty content/blog/ directory', () => {
    describe('When compileBlog runs', () => {
      it('then returns zero counts and writes an empty manifest', async () => {
        const root = makeTempProject();
        try {
          const { postCount, authorCount } = await compileInto(root);
          expect(postCount).toBe(0);
          expect(authorCount).toBe(0);
          const manifest = readFileSync(join(root, 'out', 'manifest.ts'), 'utf-8');
          expect(manifest).toContain('generatedPosts: GeneratedPost[] = [');
          expect(manifest).toContain('generatedAuthors: AuthorManifest');
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });

  describe('Given a single MDX post with YAML frontmatter that would trip a hand-rolled parser', () => {
    describe('When compileBlog runs', () => {
      it('then uses the real YAML parser via @mdx-js/mdx and preserves quoted strings with commas', async () => {
        const root = makeTempProject();
        try {
          writePost(
            root,
            '2026-04-22-tricky.mdx',
            [
              '---',
              'title: "Shipping v0.1: lessons, learned"',
              'date: 2026-04-22',
              'author: matheus',
              'description: "A post"',
              'tags: ["comma, inside", "normal"]',
              'draft: false',
              '---',
              '',
              'Body.',
            ].join('\n'),
          );
          writeAuthor(root, 'matheus', { name: 'M', avatar: '', bio: '', twitter: '' });
          const { postCount, authorCount } = await compileInto(root);
          expect(postCount).toBe(1);
          expect(authorCount).toBe(1);

          const manifest = readFileSync(join(root, 'out', 'manifest.ts'), 'utf-8');
          expect(manifest).toContain('"title":"Shipping v0.1: lessons, learned"');
          expect(manifest).toContain('"comma, inside"');
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });

  describe('Given MDX with inline code containing angle brackets', () => {
    describe('When compileBlog runs', () => {
      it('then the code text is HTML-escaped in the rendered output', async () => {
        const root = makeTempProject();
        try {
          writePost(
            root,
            '2026-04-22-angle.mdx',
            [
              '---',
              'title: Angle brackets',
              'date: 2026-04-22',
              'author: matheus',
              'description: D',
              '---',
              '',
              'See `/blog/<slug>` for every post.',
            ].join('\n'),
          );
          writeAuthor(root, 'matheus', { name: 'M', avatar: '', bio: '', twitter: '' });
          await compileInto(root);
          const manifest = readFileSync(join(root, 'out', 'manifest.ts'), 'utf-8');
          // Must NOT contain literal `<slug>` which would corrupt browser HTML.
          expect(manifest).not.toContain('<code>/blog/<slug></code>');
          expect(manifest).toContain('&lt;slug&gt;');
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });

  describe('Given a heading with HTML-entity-looking text', () => {
    describe('When compileBlog runs', () => {
      it('then the heading id is slugified from the decoded text', async () => {
        const root = makeTempProject();
        try {
          writePost(
            root,
            '2026-04-22-entities.mdx',
            [
              '---',
              'title: Entities',
              'date: 2026-04-22',
              'author: matheus',
              'description: D',
              '---',
              '',
              '## Foo & Bar',
              '',
              'Body.',
            ].join('\n'),
          );
          writeAuthor(root, 'matheus', { name: 'M', avatar: '', bio: '', twitter: '' });
          await compileInto(root);
          const manifest = readFileSync(join(root, 'out', 'manifest.ts'), 'utf-8');
          // Entity is decoded then slugified → "foo-bar" (not "foo-amp-bar").
          expect(manifest).toMatch(/id=\\"foo-bar\\"/);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });

  describe('Given a 440-word MDX body', () => {
    describe('When compileBlog runs', () => {
      it('then the manifest stores wordCount === 440 and the rendered HTML', async () => {
        const root = makeTempProject();
        try {
          const body = Array.from({ length: 440 }).fill('word').join(' ');
          writePost(
            root,
            '2026-04-22-long.mdx',
            [
              '---',
              'title: Long',
              'date: 2026-04-22',
              'author: matheus',
              'description: A long post',
              '---',
              '',
              body,
            ].join('\n'),
          );
          writeAuthor(root, 'matheus', { name: 'M', avatar: '', bio: '', twitter: '' });
          await compileInto(root);
          const manifest = readFileSync(join(root, 'out', 'manifest.ts'), 'utf-8');
          expect(manifest).toMatch(/wordCount:\s*440/);
          // HTML is embedded as a JSON-encoded field — body renders as a <p>.
          expect(manifest).toContain('html:');
          expect(manifest).toMatch(/<p>word word/);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });
});
