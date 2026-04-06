import { tool } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

export function createSandboxTools(sandbox: SandboxClient) {
  const readFile = tool({
    description: 'Read the content of a file in the repository',
    input: s.object({ path: s.string() }),
    output: s.object({ content: s.string() }),
    parallel: true,
    async handler({ path }) {
      const content = await sandbox.readFile(path);
      return { content };
    },
  });

  const writeFile = tool({
    description: 'Write content to a file in the repository',
    input: s.object({ path: s.string(), content: s.string() }),
    output: s.object({ success: s.boolean() }),
    async handler({ path, content }) {
      await sandbox.writeFile(path, content);
      return { success: true };
    },
  });

  const searchCode = tool({
    description: 'Search for a pattern in the codebase (grep)',
    input: s.object({
      pattern: s.string(),
      path: s.string().optional(),
    }),
    output: s.object({
      matches: s.array(s.object({
        file: s.string(),
        line: s.number(),
        content: s.string(),
      })),
    }),
    parallel: true,
    async handler({ pattern, path }) {
      const matches = await sandbox.searchFiles(pattern, path);
      return { matches };
    },
  });

  const listFiles = tool({
    description: 'List files in a directory',
    input: s.object({ path: s.string() }),
    output: s.object({ files: s.array(s.string()) }),
    parallel: true,
    async handler({ path }) {
      const files = await sandbox.listFiles(path);
      return { files };
    },
  });

  return { readFile, writeFile, searchCode, listFiles };
}
