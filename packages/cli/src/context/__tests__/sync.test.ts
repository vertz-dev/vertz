import { describe, expect, it } from 'bun:test';
import type { ContextBlock, ToolAdapter } from '../types';
import { syncContext } from '../sync';

// ── Test helpers ────────────────────────────────────────────

const block = (overrides: Partial<ContextBlock> & { id: string }): ContextBlock => ({
  title: overrides.id,
  category: 'overview',
  content: `Content of ${overrides.id}`,
  priority: 1,
  ...overrides,
});

const testAdapter = (name: string, outputPath: string): ToolAdapter => ({
  name,
  generate(blocks) {
    const content = blocks
      .sort((a, b) => a.priority - b.priority)
      .map((b) => `## ${b.title}\n\n${b.content}`)
      .join('\n\n');
    return [{ path: outputPath, content }];
  },
});

// ── syncContext ─────────────────────────────────────────────

describe('syncContext', () => {
  it('generates files from blocks using adapters', () => {
    const blocks = [
      block({ id: 'overview', title: 'Overview', content: 'My project' }),
      block({ id: 'api', title: 'API', category: 'api', content: 'API docs' }),
    ];

    const adapters = [testAdapter('generic', 'AGENTS.md')];

    const files = syncContext({ blocks, adapters });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('AGENTS.md');
    expect(files[0].content).toContain('## Overview');
    expect(files[0].content).toContain('My project');
    expect(files[0].content).toContain('## API');
  });

  it('generates files from multiple adapters', () => {
    const blocks = [block({ id: 'overview', title: 'Overview', content: 'Hello' })];

    const adapters = [
      testAdapter('generic', 'AGENTS.md'),
      testAdapter('cursor', '.cursorrules'),
    ];

    const files = syncContext({ blocks, adapters });

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path)).toEqual(['AGENTS.md', '.cursorrules']);
  });

  it('passes all blocks to each adapter', () => {
    let receivedBlocks: ContextBlock[] = [];

    const capturingAdapter: ToolAdapter = {
      name: 'capture',
      generate(blocks) {
        receivedBlocks = blocks;
        return [];
      },
    };

    const blocks = [
      block({ id: 'a', priority: 1 }),
      block({ id: 'b', priority: 2 }),
      block({ id: 'c', priority: 3 }),
    ];

    syncContext({ blocks, adapters: [capturingAdapter] });

    expect(receivedBlocks).toHaveLength(3);
  });

  it('filters blocks by adapter filter function if provided', () => {
    let receivedBlocks: ContextBlock[] = [];

    const filteringAdapter: ToolAdapter = {
      name: 'api-only',
      filter: (b) => b.category === 'api',
      generate(blocks) {
        receivedBlocks = blocks;
        return [];
      },
    };

    const blocks = [
      block({ id: 'overview', category: 'overview' }),
      block({ id: 'api', category: 'api' }),
      block({ id: 'ui', category: 'ui' }),
    ];

    syncContext({ blocks, adapters: [filteringAdapter] });

    expect(receivedBlocks).toHaveLength(1);
    expect(receivedBlocks[0].id).toBe('api');
  });
});
