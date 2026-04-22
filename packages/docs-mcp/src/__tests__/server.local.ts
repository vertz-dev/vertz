import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from '@vertz/test';
import { buildIndex } from '../search';
import type { DocsBundle } from '../tools';

const here = dirname(fileURLToPath(import.meta.url));
const cliSourcePath = resolve(here, '..', 'cli.ts');
const distCliPath = resolve(here, '..', '..', 'dist', 'cli.js');

const fixtureBundle: DocsBundle = {
  index: buildIndex([
    {
      id: 'guides/entities',
      title: 'Entities',
      path: 'guides/entities',
      body: 'Define an entity using d.table().',
    },
    {
      id: 'guides/services',
      title: 'Services',
      path: 'guides/services',
      body: 'Build a typed REST service in Vertz.',
    },
  ]),
  contents: {
    'guides/entities': '# Entities\n\nDefine an entity using d.table().',
    'guides/services': '# Services\n\nBuild a typed REST service in Vertz.',
  },
  guides: [
    { path: 'guides/entities', title: 'Entities', description: 'How to define' },
    { path: 'guides/services', title: 'Services' },
  ],
  examples: {
    'task-manager': '// example: task manager\nexport const tasks = d.table();',
  },
};

interface ToolTextResult {
  content: Array<{ type: string; text?: string }>;
}

function parseToolText<T>(result: ToolTextResult): T {
  const text = result.content[0]?.text;
  expect(typeof text).toBe('string');
  return JSON.parse(text as string) as T;
}

const createdTmpDirs: string[] = [];

async function makeFixtureIndexPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'docs-mcp-itest-'));
  createdTmpDirs.push(dir);
  const indexPath = join(dir, 'docs-index.generated.json');
  await writeFile(indexPath, JSON.stringify(fixtureBundle), 'utf8');
  return indexPath;
}

let client: Client;

beforeAll(async () => {
  const indexPath = await makeFixtureIndexPath();

  const transport = new StdioClientTransport({
    command: 'bun',
    args: [cliSourcePath],
    env: {
      ...process.env,
      VERTZ_DOCS_INDEX_PATH: indexPath,
    } as Record<string, string>,
  });

  client = new Client({ name: 'docs-mcp-itest', version: '0.0.0' });
  await client.connect(transport);
}, 15000);

afterAll(async () => {
  if (client) await client.close();
  for (const dir of createdTmpDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Feature: @vertz/docs-mcp spawn integration', () => {
  describe('Given the CLI is spawned via stdio', () => {
    describe('When listing tools', () => {
      it('then exposes search_docs, get_doc, list_guides, get_example', async () => {
        const result = await client.listTools();

        expect(result.tools.map((t) => t.name).sort()).toEqual([
          'get_doc',
          'get_example',
          'list_guides',
          'search_docs',
        ]);
      });
    });

    describe('When calling search_docs', () => {
      it('then returns the matching doc as the top hit', async () => {
        const raw = await client.callTool({
          name: 'search_docs',
          arguments: { query: 'entity' },
        });

        const data = parseToolText<{
          results: Array<{ id: string; score: number }>;
        }>(raw as ToolTextResult);
        expect(data.results[0]?.id).toBe('guides/entities');
      });
    });

    describe('When calling get_doc', () => {
      it('then returns the full markdown content', async () => {
        const raw = await client.callTool({
          name: 'get_doc',
          arguments: { path: 'guides/entities' },
        });

        const data = parseToolText<{ found: boolean; content: string }>(raw as ToolTextResult);
        expect(data.found).toBe(true);
        expect(data.content).toContain('# Entities');
      });
    });

    describe('When calling list_guides', () => {
      it('then returns the bundle guides list', async () => {
        const raw = await client.callTool({ name: 'list_guides' });

        const data = parseToolText<{
          guides: Array<{ path: string }>;
        }>(raw as ToolTextResult);
        expect(data.guides.map((g) => g.path).sort()).toEqual([
          'guides/entities',
          'guides/services',
        ]);
      });
    });

    describe('When calling get_example', () => {
      it('then returns the example source', async () => {
        const raw = await client.callTool({
          name: 'get_example',
          arguments: { name: 'task-manager' },
        });

        const data = parseToolText<{ found: boolean; source: string }>(raw as ToolTextResult);
        expect(data.found).toBe(true);
        expect(data.source).toContain('task manager');
      });
    });
  });
});

const skipBuiltCli = !existsSync(distCliPath);
const describeBuilt = skipBuiltCli ? describe.skip : describe;

describeBuilt('Feature: built dist/cli.js with bundled index (regression for B1)', () => {
  describe('Given dist/ contains both cli.js and docs-index.generated.json', () => {
    describe('When spawned without VERTZ_DOCS_INDEX_PATH', () => {
      it('then connects and returns a non-empty tools list', async () => {
        const cleanEnv = { ...process.env };
        delete cleanEnv['VERTZ_DOCS_INDEX_PATH'];

        const transport = new StdioClientTransport({
          command: 'node',
          args: [distCliPath],
          env: cleanEnv as Record<string, string>,
        });
        const builtClient = new Client({
          name: 'docs-mcp-built',
          version: '0.0.0',
        });
        try {
          await builtClient.connect(transport);
          const tools = await builtClient.listTools();
          expect(tools.tools.length).toBeGreaterThan(0);
          expect(tools.tools.map((t) => t.name)).toContain('search_docs');
        } finally {
          await builtClient.close();
        }
      }, 15000);
    });
  });
});

describe('Feature: @vertz/docs-mcp surfaces actionable errors (S2)', () => {
  describe('Given VERTZ_DOCS_INDEX_PATH points to a non-existent file', () => {
    describe('When the CLI runs', () => {
      it('then prints a hint pointing at reinstall / VERTZ_DOCS_INDEX_PATH and exits 1', () => {
        const result = spawnSync('bun', [cliSourcePath], {
          env: {
            ...process.env,
            VERTZ_DOCS_INDEX_PATH: '/nonexistent/path.json',
          } as Record<string, string>,
          timeout: 5000,
          encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/docs index/i);
        expect(result.stderr).toMatch(/VERTZ_DOCS_INDEX_PATH/);
        expect(result.stderr).not.toMatch(/^\s*at\s/m);
      });
    });
  });

  describe('Given VERTZ_DOCS_INDEX_PATH points to a malformed JSON file', () => {
    describe('When the CLI runs', () => {
      it('then prints a malformed-index hint and exits 1', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'docs-mcp-corrupt-'));
        createdTmpDirs.push(dir);
        const bogusPath = join(dir, 'corrupt.json');
        await writeFile(bogusPath, 'not-json{', 'utf8');

        const result = spawnSync('bun', [cliSourcePath], {
          env: {
            ...process.env,
            VERTZ_DOCS_INDEX_PATH: bogusPath,
          } as Record<string, string>,
          timeout: 5000,
          encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/malformed|invalid/i);
        expect(result.stderr).not.toMatch(/^\s*at\s/m);
      });
    });
  });

  describe('Given VERTZ_DOCS_INDEX_PATH points to a JSON file with the wrong shape', () => {
    describe('When the CLI runs', () => {
      it('then prints a shape-mismatch hint and exits 1', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'docs-mcp-shape-'));
        createdTmpDirs.push(dir);
        const bogusPath = join(dir, 'wrong-shape.json');
        await writeFile(bogusPath, JSON.stringify({ foo: 'bar' }), 'utf8');

        const result = spawnSync('bun', [cliSourcePath], {
          env: {
            ...process.env,
            VERTZ_DOCS_INDEX_PATH: bogusPath,
          } as Record<string, string>,
          timeout: 5000,
          encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/shape|invalid|missing/i);
      });
    });
  });
});
