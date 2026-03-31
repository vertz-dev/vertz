import type { ToolAdapter } from '../types';

/**
 * GitHub Copilot adapter — generates .github/copilot-instructions.md.
 * Single file format, all blocks included.
 */
export const copilotAdapter: ToolAdapter = {
  name: 'copilot',

  generate(blocks) {
    const sorted = [...blocks].sort((a, b) => a.priority - b.priority);
    const content = sorted
      .map((b) => `## ${b.title}\n\n${b.content}`)
      .join('\n\n');

    return [{ path: '.github/copilot-instructions.md', content }];
  },
};
