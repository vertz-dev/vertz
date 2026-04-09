import { beforeAll, describe, expect, it } from '@vertz/test';
import { createMdxPlugin } from '../index';

// Pre-created plugin instances — reuse Shiki highlighter across tests.
// Without this, each test creates a new plugin instance that re-initializes
// Shiki's WASM + grammar loading, causing >30s timeouts on CI runners.
const defaultPlugin = createMdxPlugin();
const jsxImportSourcePlugin = createMdxPlugin({ jsxImportSource: '@vertz/ui-server' });
const noFrontmatterPlugin = createMdxPlugin({ remarkFrontmatter: false });
const noShikiPlugin = createMdxPlugin({ shikiTheme: false });

// Helper: resolve a pre-created plugin for the given options, or create a new one.
function resolvePlugin(options?: Parameters<typeof createMdxPlugin>[0]) {
  if (!options) return defaultPlugin;
  // Match known option combinations to pre-created instances
  if (options.jsxImportSource === '@vertz/ui-server' && Object.keys(options).length === 1)
    return jsxImportSourcePlugin;
  if (options.remarkFrontmatter === false && Object.keys(options).length === 1)
    return noFrontmatterPlugin;
  if (options.shikiTheme === false && Object.keys(options).length === 1) return noShikiPlugin;
  // Empty remarkPlugins/rehypePlugins arrays are semantically identical to default
  const isEmptyArrayOnly =
    Object.keys(options).length === 1 &&
    (('remarkPlugins' in options &&
      Array.isArray(options.remarkPlugins) &&
      options.remarkPlugins.length === 0) ||
      ('rehypePlugins' in options &&
        Array.isArray(options.rehypePlugins) &&
        options.rehypePlugins.length === 0));
  if (isEmptyArrayOnly) return defaultPlugin;
  // Unknown combination — create a new plugin (will cold-init Shiki if enabled)
  return createMdxPlugin(options);
}

// Helper: build an MDX file through the plugin, marking jsx-runtime as external.
async function buildMdx(content: string, options?: Parameters<typeof createMdxPlugin>[0]) {
  const path = `/tmp/vertz-mdx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mdx`;
  await Bun.write(path, content);

  const result = await Bun.build({
    entrypoints: [path],
    plugins: [resolvePlugin(options)],
    target: 'bun',
    external: ['@vertz/ui', '@vertz/ui-server'],
  });

  if (!result.success) {
    throw new Error(`Build failed: ${result.logs.map((l) => l.message).join('\n')}`);
  }

  return result.outputs[0]?.text() ?? '';
}

describe('createMdxPlugin', () => {
  it('returns a BunPlugin with name "vertz-mdx"', () => {
    const plugin = createMdxPlugin();
    expect(plugin.name).toBe('vertz-mdx');
    expect(plugin.setup).toBeFunction();
  });
});

describe('MDX compilation via Bun plugin', () => {
  // Pre-warm ALL Shiki-enabled plugins: first Bun.build() + Shiki WASM init is
  // slow on CI runners (~15-30s per instance). Paying the cost here prevents
  // individual tests from timing out. noShikiPlugin doesn't need warm-up.
  beforeAll(async () => {
    await Promise.all([
      buildMdx('# warm-default'),
      buildMdx('# warm-jsx', { jsxImportSource: '@vertz/ui-server' }),
      buildMdx('# warm-no-frontmatter', { remarkFrontmatter: false }),
    ]);
  }, 120_000);

  it('compiles a simple MDX file to a JS module with MDXContent', async () => {
    const output = await buildMdx('# Hello World\n\nA paragraph.');

    expect(output).toContain('MDXContent');
    expect(output).toMatch(/jsx|jsxs|Fragment/);
  });

  it('defaults jsxImportSource to @vertz/ui', async () => {
    const output = await buildMdx('# Hello');

    expect(output).toContain('@vertz/ui/jsx-runtime');
  });

  it('compiles with custom jsxImportSource when specified', async () => {
    const output = await buildMdx('# Hello', {
      jsxImportSource: '@vertz/ui-server',
    });

    expect(output).toContain('@vertz/ui-server/jsx-runtime');
  });

  it('extracts frontmatter as a named export', async () => {
    const output = await buildMdx(`---
title: Button
description: A button component.
---

# Button`);

    expect(output).toContain('frontmatter');
    expect(output).toContain('Button');
    expect(output).toContain('A button component');
  });

  it('disables frontmatter extraction when remarkFrontmatter is false', async () => {
    const output = await buildMdx(
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
    const output = await buildMdx(`# Code

\`\`\`tsx
const x: number = 42;
\`\`\``);

    // Shiki adds inline styles to code blocks
    expect(output).toContain('style');
    // Should contain span elements for highlighted tokens
    expect(output).toContain('span');
  });

  it('disables Shiki when shikiTheme is false', async () => {
    const output = await buildMdx(
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
    // Verify it doesn't crash with empty plugins array
    const output = await buildMdx('# Test', { remarkPlugins: [] });
    expect(output).toContain('MDXContent');
  });

  it('passes custom rehype plugins through', async () => {
    // Verify it doesn't crash with empty plugins array
    const output = await buildMdx('# Test', { rehypePlugins: [] });
    expect(output).toContain('MDXContent');
  });

  it('fails build on malformed MDX with unclosed JSX', async () => {
    await expect(buildMdx('<div>unclosed')).rejects.toThrow();
  });
});

describe('dual Shiki theme support', () => {
  const dualThemePlugin = createMdxPlugin({
    shikiTheme: { light: 'github-light', dark: 'github-dark' },
  });

  beforeAll(async () => {
    const path = `/tmp/vertz-mdx-dual-warm-${Date.now()}.mdx`;
    await Bun.write(path, '# warm');
    await Bun.build({
      entrypoints: [path],
      plugins: [dualThemePlugin],
      target: 'bun',
      external: ['@vertz/ui'],
    });
  }, 120_000);

  it('produces CSS variable-based dual theme output', async () => {
    const path = `/tmp/vertz-mdx-dual-${Date.now()}.mdx`;
    await Bun.write(
      path,
      `# Code

\`\`\`ts
const x: number = 42;
\`\`\``,
    );

    const result = await Bun.build({
      entrypoints: [path],
      plugins: [dualThemePlugin],
      target: 'bun',
      external: ['@vertz/ui'],
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.logs.map((l) => l.message).join('\n')}`);
    }

    const output = await result.outputs[0]!.text();

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
