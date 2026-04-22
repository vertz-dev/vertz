#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import type { DocsBundle } from './tools';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexPath = process.env['VERTZ_DOCS_INDEX_PATH'] ?? join(here, 'docs-index.generated.json');

  const raw = await readFile(indexPath, 'utf8');
  const bundle = JSON.parse(raw) as DocsBundle;

  const server = createServer(bundle);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`@vertz/docs-mcp failed to start: ${String(err)}\n`);
  process.exit(1);
});
