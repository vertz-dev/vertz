import { beforeAll, describe, expect, it } from 'bun:test';
import { createMdxPlugin } from '../index';

// Shared default plugin — reuses the same Shiki highlighter across tests.
// Without this, each test creates a new plugin instance that re-initializes
// Shiki's WASM + grammar loading, causing >30s timeouts on CI runners.
const defaultPlugin = createMdxPlugin();

// Helper: build an MDX file through the plugin, marking jsx-runtime as external.
// Uses the shared default plugin unless custom options require a new instance.
async function buildMdx(content: string, options?: Parameters<typeof createMdxPlugin>[0]) {
  const path = `/tmp/vertz-mdx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mdx`;
  await Bun.write(path, content);

  const plugin = options ? createMdxPlugin(options) : defaultPlugin;
  const result = await Bun.build({
    entrypoints: [path],
    plugins: [plugin],
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
  // Pre-warm the shared plugin: first Bun.build() + Shiki init is slow on CI
  // runners (~15-30s). Paying the cost here prevents individual tests from timing out.
  beforeAll(async () => {
    await buildMdx('# warm');
  }, 60_000);

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
