import { writeFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from '@vertz/test';
import { compileMdx } from '../compile-mdx';
import { createMdxPlugin } from '../index';

describe('createMdxPlugin', () => {
  it('returns a plugin with name "vertz-mdx"', () => {
    const plugin = createMdxPlugin();
    expect(plugin.name).toBe('vertz-mdx');
    expect(plugin.setup).toBeFunction();
  });

  it('onLoad reads a file and compiles MDX', async () => {
    const plugin = createMdxPlugin({ shikiTheme: false });
    let onLoadCallback:
      | ((args: { path: string }) => Promise<{ contents: string; loader: string }>)
      | undefined;

    plugin.setup({
      onLoad(_opts, cb) {
        onLoadCallback = cb;
      },
    });

    const tmpPath = `/tmp/vertz-mdx-onload-${Date.now()}.mdx`;
    await writeFile(tmpPath, '# Plugin Test');
    const result = await onLoadCallback!({ path: tmpPath });
    expect(result.loader).toBe('js');
    expect(result.contents).toContain('MDXContent');
  });
});

describe('MDX compilation via compileMdx', () => {
  // Pre-warm Shiki: first call initializes WASM + grammar loading (~15-30s on CI).
  // Paying the cost here prevents individual tests from timing out.
  beforeAll(async () => {
    await Promise.all([
      compileMdx('# warm-default'),
      compileMdx('# warm-jsx', { jsxImportSource: '@vertz/ui-server' }),
      compileMdx('# warm-no-frontmatter', { remarkFrontmatter: false }),
    ]);
  }, 120_000);

  it('compiles a simple MDX file to a JS module with MDXContent', async () => {
    const output = await compileMdx('# Hello World\n\nA paragraph.');

    expect(output).toContain('MDXContent');
    expect(output).toMatch(/jsx|jsxs|Fragment/);
  });

  it('defaults jsxImportSource to @vertz/ui', async () => {
    const output = await compileMdx('# Hello');

    expect(output).toContain('@vertz/ui/jsx-runtime');
  });

  it('compiles with custom jsxImportSource when specified', async () => {
    const output = await compileMdx('# Hello', {
      jsxImportSource: '@vertz/ui-server',
    });

    expect(output).toContain('@vertz/ui-server/jsx-runtime');
  });

  it('extracts frontmatter as a named export', async () => {
    const output = await compileMdx(`---
title: Button
description: A button component.
---

# Button`);

    expect(output).toContain('frontmatter');
    expect(output).toContain('Button');
    expect(output).toContain('A button component');
  });

  it('disables frontmatter extraction when remarkFrontmatter is false', async () => {
    const output = await compileMdx(
      `---
title: NoExtract
---

# Test`,
      { remarkFrontmatter: false },
    );

    // Should not have frontmatter as a named export
    expect(output).not.toMatch(/export\s*\{[^}]*frontmatter/);
  });

  it('applies Shiki syntax highlighting to code fences', async () => {
    const output = await compileMdx(`# Code

\`\`\`tsx
const x: number = 42;
\`\`\``);

    // Shiki adds inline styles to code blocks
    expect(output).toContain('style');
    // Should contain span elements for highlighted tokens
    expect(output).toContain('span');
  });

  it('disables Shiki when shikiTheme is false', async () => {
    const output = await compileMdx(
      `# Code

\`\`\`tsx
const x = 1;
\`\`\``,
      { shikiTheme: false },
    );

    // Without Shiki, code blocks render as plain <pre><code>
    expect(output).toContain('pre');
    expect(output).toContain('code');
    // Should NOT have inline color styles from Shiki
    expect(output).not.toContain('color:');
  });

  it('passes custom remark plugins through', async () => {
    const output = await compileMdx('# Test', { remarkPlugins: [] });
    expect(output).toContain('MDXContent');
  });

  it('passes custom rehype plugins through', async () => {
    const output = await compileMdx('# Test', { rehypePlugins: [] });
    expect(output).toContain('MDXContent');
  });

  it('fails on malformed MDX with unclosed JSX', async () => {
    await expect(compileMdx('<div>unclosed')).rejects.toThrow();
  });
});

describe('dual Shiki theme support', () => {
  const dualThemeOptions = {
    shikiTheme: { light: 'github-light', dark: 'github-dark' } as const,
  };

  beforeAll(async () => {
    await compileMdx('# warm', dualThemeOptions);
  }, 120_000);

  it('produces CSS variable-based dual theme output', async () => {
    const output = await compileMdx(
      `# Code

\`\`\`ts
const x: number = 42;
\`\`\``,
      dualThemeOptions,
    );

    // Dual theme uses CSS variables like --shiki-light and --shiki-dark
    expect(output).toContain('--shiki-');
  });

  it('accepts shikiTheme as an object with light and dark keys', () => {
    const plugin = createMdxPlugin({
      shikiTheme: { light: 'github-light', dark: 'github-dark' },
    });
    expect(plugin.name).toBe('vertz-mdx');
  });
});
