import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@vertz/test';
import { buildDocsIndex } from '../../scripts/build-index';

describe('buildDocsIndex()', () => {
  describe('Given a docs directory with two .mdx files (one nested)', () => {
    describe('When buildDocsIndex runs', () => {
      it('then returns contents map keyed by relative path without extension', async () => {
        const root = await mkdtemp(join(tmpdir(), 'docs-mcp-fixture-'));
        await writeFile(
          join(root, 'quickstart.mdx'),
          `---\ntitle: Quickstart\ndescription: Get started\n---\n\nHello world.\n`,
        );
        await mkdir(join(root, 'guides'));
        await writeFile(
          join(root, 'guides/entities.mdx'),
          `---\ntitle: Entities\n---\n\nDefine an entity.\n`,
        );

        const result = await buildDocsIndex(root);

        expect(result.contents['quickstart']).toContain('Hello world.');
        expect(result.contents['guides/entities']).toContain('Define an entity.');
      });

      it('then returns guides list with parsed frontmatter title', async () => {
        const root = await mkdtemp(join(tmpdir(), 'docs-mcp-fixture-'));
        await mkdir(join(root, 'guides'));
        await writeFile(
          join(root, 'guides/entities.mdx'),
          `---\ntitle: Entities\ndescription: How to define\n---\n\nbody`,
        );

        const result = await buildDocsIndex(root);

        const entry = result.guides.find((g) => g.path === 'guides/entities');
        expect(entry?.title).toBe('Entities');
        expect(entry?.description).toBe('How to define');
      });

      it('then returns a searchable index over the docs', async () => {
        const root = await mkdtemp(join(tmpdir(), 'docs-mcp-fixture-'));
        await writeFile(join(root, 'a.mdx'), `---\ntitle: Apples\n---\n\nApples are red fruit.`);
        await writeFile(
          join(root, 'b.mdx'),
          `---\ntitle: Bridges\n---\n\nBridges connect riverbanks.`,
        );

        const result = await buildDocsIndex(root);

        expect(result.index.docs.length).toBe(2);
        expect(result.index.docs.map((d) => d.id).sort()).toEqual(['a', 'b']);
      });
    });
  });

  describe('Given a docs directory whose examples/ subdir is also passed as examplesDir', () => {
    describe('When buildDocsIndex runs', () => {
      it('then files under examples/ are NOT in the docs index or guides list', async () => {
        const root = await mkdtemp(join(tmpdir(), 'docs-mcp-fixture-'));
        await writeFile(join(root, 'guides.mdx'), `---\ntitle: Guides\n---\n\nbody`);
        await mkdir(join(root, 'examples'));
        await writeFile(
          join(root, 'examples/task-manager.mdx'),
          `---\ntitle: Task Manager\n---\n\nexample body`,
        );

        const result = await buildDocsIndex(root, {
          examplesDir: join(root, 'examples'),
        });

        expect(result.index.docs.map((d) => d.id)).not.toContain('examples/task-manager');
        expect(result.guides.map((g) => g.path)).not.toContain('examples/task-manager');
        expect(result.examples['task-manager']).toBeTruthy();
      });
    });
  });
});
