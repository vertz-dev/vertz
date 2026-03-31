import type { ContextBlock, ToolAdapter } from '../types';

/**
 * Claude Code adapter — generates CLAUDE.md + .claude/rules/*.md.
 * Split strategy: overview + cli blocks go in CLAUDE.md (loaded first),
 * category-specific blocks go in .claude/rules/ (loaded contextually).
 * This saves tokens — rules are only loaded when relevant.
 */
export const claudeAdapter: ToolAdapter = {
  name: 'claude',

  generate(blocks) {
    const mainCategories = new Set<string>(['overview', 'cli']);
    const mainBlocks: ContextBlock[] = [];
    const ruleBlocks = new Map<string, ContextBlock[]>();

    for (const block of blocks) {
      if (mainCategories.has(block.category)) {
        mainBlocks.push(block);
      } else {
        const group = ruleBlocks.get(block.category) ?? [];
        group.push(block);
        ruleBlocks.set(block.category, group);
      }
    }

    const files = [];

    // CLAUDE.md — overview + cli blocks
    const mainContent = [...mainBlocks]
      .sort((a, b) => a.priority - b.priority)
      .map((b) => `## ${b.title}\n\n${b.content}`)
      .join('\n\n');
    files.push({ path: 'CLAUDE.md', content: mainContent });

    // .claude/rules/<category>.md — detailed blocks per category
    for (const [category, categoryBlocks] of ruleBlocks) {
      const content = [...categoryBlocks]
        .sort((a, b) => a.priority - b.priority)
        .map((b) => `## ${b.title}\n\n${b.content}`)
        .join('\n\n');
      files.push({ path: `.claude/rules/${category}.md`, content });
    }

    return files;
  },
};
