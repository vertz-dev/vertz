import { beforeEach, describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import type { ResolvedConfig } from '../../config';
import { AuthAnalyzer } from '../auth-analyzer';

describe('AuthAnalyzer', () => {
  let project: Project;
  let config: ResolvedConfig;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    config = {
      rootDir: '/',
      entryFile: 'index.ts',
      compiler: {
        outputDir: '.vertz',
        exclude: [],
      },
      forceGenerate: false,
    };
  });

  function createFile(path: string, content: string) {
    return project.createSourceFile(path, content, { overwrite: true });
  }

  function analyze() {
    const analyzer = new AuthAnalyzer(project, config);
    return analyzer.analyze();
  }

  it('returns undefined auth when no createServer() call exists', async () => {
    createFile('/index.ts', 'const x = 1;');
    const result = await analyze();

    expect(result.auth).toBeUndefined();
  });

  it('returns undefined auth when createServer() has no auth config', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({ basePath: '/api' });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeUndefined();
  });

  it('detects emailPassword feature', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({
        auth: {
          emailPassword: true,
        },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
  });

  it('detects tenant feature', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({
        auth: {
          tenant: true,
        },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('tenant');
  });

  it('detects providers feature', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({
        auth: {
          providers: [{ name: 'github' }],
        },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('providers');
  });

  it('detects multiple features', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({
        auth: {
          emailPassword: true,
          tenant: true,
          providers: [{ name: 'github' }],
          mfa: true,
        },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('tenant');
    expect(result.auth?.features).toContain('providers');
    expect(result.auth?.features).toContain('mfa');
  });

  it('ignores method calls that look like createServer (e.g., obj.createServer)', async () => {
    createFile(
      '/index.ts',
      `
      const server = app.createServer({
        auth: { emailPassword: true },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeUndefined();
  });

  it('detects auth in the first createServer call found', async () => {
    createFile(
      '/index.ts',
      `
      const server = createServer({
        auth: { emailPassword: true },
      });
    `,
    );
    createFile(
      '/other.ts',
      `
      const server2 = createServer({
        auth: { tenant: true },
      });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
  });
});
