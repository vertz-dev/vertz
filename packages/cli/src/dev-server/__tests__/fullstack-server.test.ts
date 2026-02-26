import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DetectedApp } from '../app-detector';
import { formatBanner, importServerModule, resolveDevMode } from '../fullstack-server';

describe('resolveDevMode', () => {
  it('returns api-only mode for api-only apps', () => {
    const detected: DetectedApp = {
      type: 'api-only',
      serverEntry: '/project/src/server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('api-only');
    if (mode.kind === 'api-only') {
      expect(mode.serverEntry).toBe('/project/src/server.ts');
    }
  });

  it('returns full-stack mode with ssrModule: true for app.tsx entry', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      clientEntry: '/project/src/entry-client.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('full-stack');
    if (mode.kind === 'full-stack') {
      expect(mode.serverEntry).toBe('/project/src/server.ts');
      expect(mode.uiEntry).toBe('/project/src/app.tsx');
      expect(mode.ssrModule).toBe(true);
      expect(mode.clientEntry).toBe('/project/src/entry-client.ts');
    }
  });

  it('returns full-stack mode with ssrModule: false for entry-server.ts', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('full-stack');
    if (mode.kind === 'full-stack') {
      expect(mode.ssrModule).toBe(false);
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
    }
  });

  it('prefers ssrEntry over uiEntry for backward compat', () => {
    const detected: DetectedApp = {
      type: 'full-stack',
      serverEntry: '/project/src/server.ts',
      uiEntry: '/project/src/app.tsx',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    if (mode.kind === 'full-stack') {
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
      expect(mode.ssrModule).toBe(false);
    }
  });

  it('returns ui-only mode with ssrModule: true for app.tsx', () => {
    const detected: DetectedApp = {
      type: 'ui-only',
      uiEntry: '/project/src/app.tsx',
      clientEntry: '/project/src/entry-client.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('ui-only');
    if (mode.kind === 'ui-only') {
      expect(mode.uiEntry).toBe('/project/src/app.tsx');
      expect(mode.ssrModule).toBe(true);
      expect(mode.clientEntry).toBe('/project/src/entry-client.ts');
    }
  });

  it('returns ui-only mode with ssrModule: false for entry-server.ts', () => {
    const detected: DetectedApp = {
      type: 'ui-only',
      ssrEntry: '/project/src/entry-server.ts',
      projectRoot: '/project',
    };

    const mode = resolveDevMode(detected);

    expect(mode.kind).toBe('ui-only');
    if (mode.kind === 'ui-only') {
      expect(mode.uiEntry).toBe('/project/src/entry-server.ts');
      expect(mode.ssrModule).toBe(false);
    }
  });
});

describe('importServerModule', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports a module with a default export that has .handler', async () => {
    const serverPath = join(tmpDir, 'server.ts');
    writeFileSync(
      serverPath,
      `
      const app = { handler: async (req: Request) => new Response('ok') };
      export default app;
    `,
    );

    const mod = await importServerModule(serverPath);

    expect(mod.handler).toBeDefined();
    expect(typeof mod.handler).toBe('function');
  });

  it('throws when default export has no .handler', async () => {
    const serverPath = join(tmpDir, 'no-handler.ts');
    writeFileSync(
      serverPath,
      `
      export default { notHandler: true };
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('.handler');
  });

  it('throws when module has no default export', async () => {
    const serverPath = join(tmpDir, 'no-default.ts');
    writeFileSync(
      serverPath,
      `
      export const foo = 'bar';
    `,
    );

    expect(importServerModule(serverPath)).rejects.toThrow('default export');
  });
});

describe('formatBanner', () => {
  it('includes app type and mode in banner', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost', false);

    expect(banner).toContain('full-stack');
    expect(banner).toContain('HMR');
  });

  it('shows SSR mode when ssr is true', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost', true);

    expect(banner).toContain('SSR');
    expect(banner).not.toContain('HMR');
  });

  it('includes local URL', () => {
    const banner = formatBanner('api-only', 4000, 'localhost', false);

    expect(banner).toContain('http://localhost:4000');
  });

  it('includes API URL for full-stack apps', () => {
    const banner = formatBanner('full-stack', 3000, 'localhost', false);

    expect(banner).toContain('/api');
  });

  it('includes API URL for api-only apps', () => {
    const banner = formatBanner('api-only', 3000, 'localhost', false);

    expect(banner).toContain('/api');
  });

  it('does not include API URL for ui-only apps', () => {
    const banner = formatBanner('ui-only', 3000, 'localhost', false);

    expect(banner).not.toContain('/api');
  });
});
