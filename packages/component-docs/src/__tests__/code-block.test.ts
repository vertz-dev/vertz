import { beforeAll, describe, expect, it } from 'bun:test';
import { initHighlighter } from '../lib/highlighter';

describe('CodeBlock', () => {
  beforeAll(async () => {
    await initHighlighter();
  });

  it('exports CodeBlock as a function', async () => {
    const mod = await import('../components/code-block');
    expect(typeof mod.CodeBlock).toBe('function');
  });

  it('exports CodeBlockProps type (via module shape)', async () => {
    const mod = await import('../components/code-block');
    // CodeBlock is the only runtime export
    expect(Object.keys(mod)).toContain('CodeBlock');
  });
});
