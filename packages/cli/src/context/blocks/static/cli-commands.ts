import type { ContextBlock } from '../../types';

export const cliCommandsBlock: ContextBlock = {
  id: 'cli-commands',
  title: 'CLI Commands',
  category: 'cli',
  priority: 1,
  content: `\`\`\`
bun install && bun run dev     Start development
vertz codegen                  Regenerate typed client SDK
vertz build                    Production build
vertz start                    Start production server
\`\`\``,
};
