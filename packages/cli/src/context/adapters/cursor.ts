import type { ToolAdapter } from '../types';

/**
 * Cursor adapter — generates .cursorrules (single file).
 * Cursor reads one file only, so all blocks go in one place.
 */
export const cursorAdapter: ToolAdapter = {
  name: 'cursor',

  generate(blocks) {
    const sorted = [...blocks].sort((a, b) => a.priority - b.priority);
    const content = sorted
      .map((b) => `## ${b.title}\n\n${b.content}`)
      .join('\n\n');

    return [{ path: '.cursorrules', content }];
  },
};
