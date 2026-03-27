import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DocsConfig } from '../config/types';
import { validateDocs, type DocsCheckResult } from '../validate/docs-check';

/** Helper to create a minimal DocsConfig. */
function makeConfig(overrides: Partial<DocsConfig> = {}): DocsConfig {
  return {
    name: 'Test Docs',
    sidebar: [{ tab: 'Guides', groups: [{ title: 'Getting Started', pages: ['index'] }] }],
    ...overrides,
  };
}

describe('Feature: vertz docs check', () => {
  let tempDir: string;
  let pagesDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `docs-check-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    pagesDir = join(tempDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Given a sidebar referencing a page that does not exist', () => {
    describe('When running validateDocs', () => {
      it('Then returns a broken-sidebar-ref error', () => {
        const config = makeConfig({
          sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['nonexistent'] }] }],
        });

        const result = validateDocs(config, pagesDir);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: 'broken-sidebar-ref',
            severity: 'error',
            source: 'nonexistent',
          }),
        );
      });
    });
  });

  describe('Given all sidebar pages exist', () => {
    describe('When running validateDocs', () => {
      it('Then returns zero sidebar ref errors', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n',
        );

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        const sidebarErrors = result.errors.filter((e) => e.type === 'broken-sidebar-ref');
        expect(sidebarErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a page with an internal link to a non-existent page', () => {
    describe('When running validateDocs', () => {
      it('Then returns a broken-internal-link error', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [API Ref](/api/missing) for details.\n',
        );

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: 'broken-internal-link',
            severity: 'error',
            source: 'index',
            target: '/api/missing',
          }),
        );
      });
    });
  });

  describe('Given a page with an internal link to an existing page', () => {
    describe('When running validateDocs', () => {
      it('Then does not report it as broken', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [Quickstart](/quickstart) for details.\n',
        );
        writeFileSync(
          join(pagesDir, 'quickstart.mdx'),
          '---\ntitle: Quickstart\ndescription: Get started\n---\n\n# Quickstart\n',
        );

        const config = makeConfig({
          sidebar: [
            {
              tab: 'Guides',
              groups: [{ title: 'Start', pages: ['index', 'quickstart'] }],
            },
          ],
        });
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a page with an external link', () => {
    describe('When running validateDocs', () => {
      it('Then does not check external links', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [GitHub](https://github.com) for details.\n',
        );

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a page with internal link inside a code block', () => {
    describe('When running validateDocs', () => {
      it('Then skips links inside code blocks', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\n```md\nSee [Docs](/some/missing/path) for details.\n```\n',
        );

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a page missing optional description frontmatter', () => {
    describe('When running validateDocs', () => {
      it('Then returns a missing-frontmatter warning (not error)', () => {
        writeFileSync(join(pagesDir, 'index.mdx'), '---\ntitle: Home\n---\n\n# Home\n');

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        expect(result.errors.filter((e) => e.type === 'missing-frontmatter')).toHaveLength(0);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: 'missing-frontmatter',
            severity: 'warning',
            source: 'index',
          }),
        );
      });
    });
  });

  describe('Given a page with both title and description frontmatter', () => {
    describe('When running validateDocs', () => {
      it('Then returns zero warnings', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome to our docs\n---\n\n# Home\n',
        );

        const config = makeConfig();
        const result = validateDocs(config, pagesDir);

        expect(result.warnings).toHaveLength(0);
      });
    });
  });

  describe('Given a clean project with no issues', () => {
    describe('When running validateDocs', () => {
      it('Then returns zero errors and zero warnings with correct stats', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [Quickstart](/quickstart).\n',
        );
        writeFileSync(
          join(pagesDir, 'quickstart.mdx'),
          '---\ntitle: Quickstart\ndescription: Get started\n---\n\n# Quickstart\n',
        );

        const config = makeConfig({
          sidebar: [
            {
              tab: 'Guides',
              groups: [{ title: 'Start', pages: ['index', 'quickstart'] }],
            },
          ],
        });
        const result = validateDocs(config, pagesDir);

        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.stats.pages).toBe(2);
        expect(result.stats.internalLinks).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Given a page with an anchor link to an existing page', () => {
    describe('When running validateDocs', () => {
      it('Then validates the base path exists (ignores anchor)', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [Section](/quickstart#getting-started).\n',
        );
        writeFileSync(
          join(pagesDir, 'quickstart.mdx'),
          '---\ntitle: Quickstart\ndescription: Get started\n---\n\n# Quickstart\n',
        );

        const config = makeConfig({
          sidebar: [
            {
              tab: 'Guides',
              groups: [{ title: 'Start', pages: ['index', 'quickstart'] }],
            },
          ],
        });
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a page with a query-string link to an existing page', () => {
    describe('When running validateDocs', () => {
      it('Then validates the base path exists (ignores query string)', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [Quickstart](/quickstart?tab=examples).\n',
        );
        writeFileSync(
          join(pagesDir, 'quickstart.mdx'),
          '---\ntitle: Quickstart\ndescription: Get started\n---\n\n# Quickstart\n',
        );

        const config = makeConfig({
          sidebar: [
            {
              tab: 'Guides',
              groups: [{ title: 'Start', pages: ['index', 'quickstart'] }],
            },
          ],
        });
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given a link with a title attribute', () => {
    describe('When running validateDocs', () => {
      it('Then extracts only the path, not the title string', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n\nSee [Quickstart](/quickstart "Get started fast").\n',
        );
        writeFileSync(
          join(pagesDir, 'quickstart.mdx'),
          '---\ntitle: Quickstart\ndescription: Get started\n---\n\n# Quickstart\n',
        );

        const config = makeConfig({
          sidebar: [
            {
              tab: 'Guides',
              groups: [{ title: 'Start', pages: ['index', 'quickstart'] }],
            },
          ],
        });
        const result = validateDocs(config, pagesDir);

        const linkErrors = result.errors.filter((e) => e.type === 'broken-internal-link');
        expect(linkErrors).toHaveLength(0);
      });
    });
  });

  describe('Given sidebar entries with .mdx extension', () => {
    describe('When running validateDocs', () => {
      it('Then resolves the file correctly without double extension', () => {
        writeFileSync(
          join(pagesDir, 'index.mdx'),
          '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n',
        );

        const config = makeConfig({
          sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index.mdx'] }] }],
        });
        const result = validateDocs(config, pagesDir);

        const sidebarErrors = result.errors.filter((e) => e.type === 'broken-sidebar-ref');
        expect(sidebarErrors).toHaveLength(0);
      });
    });
  });
});

describe('docsCheckAction', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `docs-check-action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testDir, 'pages'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('loads config and validates the project', async () => {
    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test', sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['index'] }] }] };`,
    );
    writeFileSync(
      join(testDir, 'pages', 'index.mdx'),
      '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n',
    );

    const { docsCheckAction } = await import('../cli/actions');
    const result = await docsCheckAction({ projectDir: testDir });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.warnings).toHaveLength(0);
      expect(result.data.stats.pages).toBe(1);
    }
  });

  it('returns error when directory does not exist', async () => {
    const { docsCheckAction } = await import('../cli/actions');
    const result = await docsCheckAction({ projectDir: join(testDir, 'nonexistent') });

    expect(result.ok).toBe(false);
  });

  it('returns errors for broken sidebar refs', async () => {
    writeFileSync(
      join(testDir, 'vertz.config.ts'),
      `export default { name: 'Test', sidebar: [{ tab: 'Guides', groups: [{ title: 'Start', pages: ['missing-page'] }] }] };`,
    );

    const { docsCheckAction } = await import('../cli/actions');
    const result = await docsCheckAction({ projectDir: testDir });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.errors.length).toBeGreaterThan(0);
      expect(result.data.errors[0]!.type).toBe('broken-sidebar-ref');
    }
  });
});
