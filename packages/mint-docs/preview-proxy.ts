#!/usr/bin/env bun
/**
 * Preview proxy for testing docs changes with ax-bench.
 *
 * Serves llms.txt as plain text (Mintlify dev server doesn't generate it).
 * Proxies everything else to the Mintlify dev server on port 3333.
 *
 * Usage:
 *   1. Start Mintlify: npx mintlify dev --port 3333
 *   2. Start proxy: bun run preview-proxy.ts
 *   3. Point ax-bench docsUrl at http://localhost:3334
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MINTLIFY_PORT = 3333;
const PROXY_PORT = 3334;
const DOCS_DIR = import.meta.dirname;
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PROXY_PORT}`;

async function generateLlmsTxt(): Promise<string> {
  const lines: string[] = ['# Vertz', '', '## Docs', ''];

  // Scan all .mdx files and generate the index
  async function scanDir(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        await scanDir(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.mdx')) {
        const content = await readFile(join(dir, entry.name), 'utf-8');
        const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
        const descMatch = content.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
        const slug = `${prefix}${entry.name.replace('.mdx', '')}`;
        const title = titleMatch?.[1] ?? slug;
        const desc = descMatch?.[1] ? `: ${descMatch[1]}` : '';
        lines.push(`- [${title}](${PUBLIC_URL}/${slug}.md)${desc}`);
      }
    }
  }

  // Scan root .mdx files
  const rootEntries = await readdir(DOCS_DIR, { withFileTypes: true });
  for (const entry of rootEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      const content = await readFile(join(DOCS_DIR, entry.name), 'utf-8');
      const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
      const descMatch = content.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
      const slug = entry.name.replace('.mdx', '');
      const title = titleMatch?.[1] ?? slug;
      const desc = descMatch?.[1] ? `: ${descMatch[1]}` : '';
      lines.push(`- [${title}](${PUBLIC_URL}/${slug}.md)${desc}`);
    }
  }

  // Scan guides/ and api-reference/
  for (const subdir of ['guides', 'api-reference', 'examples']) {
    try {
      await scanDir(join(DOCS_DIR, subdir), `${subdir}/`);
    } catch { /* dir might not exist */ }
  }

  lines.push('', '', 'Built with [Mintlify](https://mintlify.com).', '');
  return lines.join('\n');
}

async function serveMdFile(path: string): Promise<Response | null> {
  // /some/page.md → read /some/page.mdx and strip frontmatter
  const mdxPath = join(DOCS_DIR, path.replace(/\.md$/, '.mdx'));
  try {
    const content = await readFile(mdxPath, 'utf-8');
    // Strip frontmatter
    const stripped = content.replace(/^---[\s\S]*?---\s*/, '');
    return new Response(stripped, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } catch {
    return null;
  }
}

const llmsTxt = await generateLlmsTxt();
console.log(`Generated llms.txt (${llmsTxt.length} bytes, ${llmsTxt.split('\n').filter(l => l.startsWith('- [')).length} pages)`);

Bun.serve({
  port: PROXY_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve llms.txt as plain text
    if (url.pathname === '/llms.txt') {
      return new Response(llmsTxt, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Serve .md files as plain text from .mdx source
    if (url.pathname.endsWith('.md')) {
      const mdResponse = await serveMdFile(url.pathname.slice(1));
      if (mdResponse) return mdResponse;
    }

    // Proxy everything else to Mintlify dev server
    try {
      const proxyUrl = `http://localhost:${MINTLIFY_PORT}${url.pathname}${url.search}`;
      const proxyRes = await fetch(proxyUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers: proxyRes.headers,
      });
    } catch {
      return new Response('Mintlify dev server not running on port 3333', { status: 502 });
    }
  },
});

console.log(`Docs preview proxy running on http://localhost:${PROXY_PORT}`);
console.log(`  /llms.txt → generated index (plain text)`);
console.log(`  /*.md → .mdx source files (plain text)`);
console.log(`  /* → proxy to Mintlify dev server (port ${MINTLIFY_PORT})`);
