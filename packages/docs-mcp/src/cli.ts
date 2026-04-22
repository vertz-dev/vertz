#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import type { DocsBundle } from './tools';

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}

function isValidBundleShape(value: unknown): value is DocsBundle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['index'] === 'object' &&
    v['index'] !== null &&
    Array.isArray((v['index'] as Record<string, unknown>)['docs']) &&
    typeof v['contents'] === 'object' &&
    typeof v['guides'] === 'object' &&
    Array.isArray(v['guides']) &&
    typeof v['examples'] === 'object'
  );
}

function fail(message: string): never {
  process.stderr.write(`@vertz/docs-mcp: ${message}\n`);
  process.exit(1);
}

async function loadBundle(indexPath: string): Promise<DocsBundle> {
  let raw: string;
  try {
    raw = await readFile(indexPath, 'utf8');
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return fail(
        `docs index not found at ${indexPath}. ` +
          `Reinstall @vertz/docs-mcp, or set VERTZ_DOCS_INDEX_PATH to a valid file.`,
      );
    }
    return fail(
      `failed to read docs index at ${indexPath}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fail(
      `docs index at ${indexPath} is malformed JSON: ${(err as Error).message}`,
    );
  }

  if (!isValidBundleShape(parsed)) {
    return fail(
      `docs index at ${indexPath} has invalid shape (missing index/contents/guides/examples).`,
    );
  }

  return parsed;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexPath =
    process.env['VERTZ_DOCS_INDEX_PATH'] ?? join(here, 'docs-index.generated.json');

  const bundle = await loadBundle(indexPath);
  const server = createServer(bundle);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(message);
});
