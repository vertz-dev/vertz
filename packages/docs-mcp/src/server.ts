import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type DocsBundle, getDoc, getExample, listGuides, searchDocs } from './tools';

interface TextResult {
  [k: string]: unknown;
  content: Array<{ type: 'text'; text: string; [k: string]: unknown }>;
}

function asText(value: unknown): TextResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function createServer(bundle: DocsBundle): McpServer {
  const server = new McpServer({
    name: '@vertz/docs-mcp',
    version: '0.2.1',
  });

  server.registerTool(
    'search_docs',
    {
      description: 'Search the Vertz documentation. Returns the top ranked excerpts for a query.',
      inputSchema: {
        query: z.string().min(1).describe('Search query (1+ keywords).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Max results to return (default 5).'),
      },
    },
    async (args) => asText(searchDocs(bundle, args)),
  );

  server.registerTool(
    'get_doc',
    {
      description: 'Fetch the full markdown content of a Vertz documentation page by path.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Doc path without extension, e.g. "guides/entities" or "quickstart".'),
      },
    },
    async (args) => asText(getDoc(bundle, args)),
  );

  server.registerTool(
    'list_guides',
    {
      description:
        'List every documentation page (path, title, optional description) for discovery.',
    },
    async () => asText(listGuides(bundle)),
  );

  server.registerTool(
    'get_example',
    {
      description:
        'Fetch the full source of a Vertz example app by name (see list at vertz.dev/docs/examples).',
      inputSchema: {
        name: z.string().min(1).describe('Example name, e.g. "task-manager".'),
      },
    },
    async (args) => asText(getExample(bundle, args)),
  );

  return server;
}
