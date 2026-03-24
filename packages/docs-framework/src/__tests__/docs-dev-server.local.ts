import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocsDevServer } from '../dev/docs-dev-server';

// Use native fetch - must run WITHOUT happy-dom preload (--no-preload)
async function httpGet(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url);
  const body = await res.text();
  return { status: res.status, body };
}

function createTmpProject(): string {
  const dir = join(tmpdir(), `docs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'pages'), { recursive: true });

  writeFileSync(
    join(dir, 'vertz.config.ts'),
    `export default {
  name: 'Test Docs',
  sidebar: [
    {
      tab: 'Guides',
      groups: [{ title: 'Getting Started', pages: ['index.mdx', 'quickstart.mdx'] }],
    },
  ],
};`,
  );

  writeFileSync(
    join(dir, 'pages', 'index.mdx'),
    `---
title: Home
---

# Welcome

This is the home page.`,
  );

  writeFileSync(
    join(dir, 'pages', 'quickstart.mdx'),
    `---
title: Quickstart
---

# Quickstart Guide

Get started in minutes.

## Installation

Run \`bun add vertz\` to install.`,
  );

  return dir;
}

let tmpDir: string;
let server: Awaited<ReturnType<typeof createDocsDevServer>> | undefined;

afterEach(async () => {
  if (server) {
    server.stop();
    server = undefined;
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('createDocsDevServer', () => {
  it('starts and serves the index page', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Welcome');
    expect(res.body).toContain('Test Docs');
  });

  it('serves other pages by URL path', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/quickstart`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Quickstart Guide');
    expect(res.body).toContain('Installation');
  });

  it('returns 404 for unknown paths', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('includes sidebar navigation', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/`);
    expect(res.body).toContain('href="/quickstart"');
    expect(res.body).toContain('data-sidebar-group');
  });

  it('includes table of contents for pages with headings', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/quickstart`);
    expect(res.body).toContain('data-toc');
    expect(res.body).toContain('Installation');
  });

  it('marks the active sidebar link', async () => {
    tmpDir = createTmpProject();
    server = await createDocsDevServer({ projectDir: tmpDir, port: 0 });

    const res = await httpGet(`http://localhost:${server.port}/quickstart`);
    expect(res.body).toContain('data-active="true"');
  });
});
