import { tool } from '@vertz/agents';
import type { InferToolProvider } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

// ---------------------------------------------------------------------------
// Tool declarations (schema only — handlers injected via ToolProvider)
// ---------------------------------------------------------------------------

export const readFile = tool({
  description: 'Read the content of a file in the repository',
  input: s.object({ path: s.string() }),
  output: s.object({ content: s.string() }),
  parallel: true,
});

export const writeFile = tool({
  description: 'Write content to a file in the repository',
  input: s.object({ path: s.string(), content: s.string() }),
  output: s.object({ success: s.boolean() }),
});

export const searchCode = tool({
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
});

export const listFiles = tool({
  description: 'List files in a directory',
  input: s.object({ path: s.string() }),
  output: s.object({ files: s.array(s.string()) }),
  parallel: true,
});

// ---------------------------------------------------------------------------
// Tool provider (binds declarations to a SandboxClient)
// ---------------------------------------------------------------------------

const sandboxTools = { readFile, writeFile, searchCode, listFiles };

export function createSandboxProvider(sandbox: SandboxClient): InferToolProvider<typeof sandboxTools> {
  return {
    readFile: async ({ path }) => {
      const content = await sandbox.readFile(path);
      return { content };
    },
    writeFile: async ({ path, content }) => {
      await sandbox.writeFile(path, content);
      return { success: true };
    },
    searchCode: async ({ pattern, path }) => {
      const matches = await sandbox.searchFiles(pattern, path);
      return { matches };
    },
    listFiles: async ({ path }) => {
      const files = await sandbox.listFiles(path);
      return { files };
    },
  };
}
