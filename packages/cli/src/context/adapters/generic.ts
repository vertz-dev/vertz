import type { ToolAdapter } from '../types';

/**
 * Generic adapter — generates AGENTS.md (universal standard).
 * All blocks in one file, sorted by priority.
 */
export const genericAdapter: ToolAdapter = {
  name: 'generic',

  generate(blocks) {
    const sorted = [...blocks].sort((a, b) => a.priority - b.priority);
    const content = sorted
      .map((b) => `## ${b.title}\n\n${b.content}`)
      .join('\n\n');

    return [{ path: 'AGENTS.md', content }];
  },
};
