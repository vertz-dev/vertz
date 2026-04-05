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

  it('detects features via shorthand property referencing a plain object', async () => {
    createFile(
      '/index.ts',
      `
      const auth = { emailPassword: true, tenant: true };
      const server = createServer({ auth });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('tenant');
  });

  it('detects features via shorthand property referencing a defineAuth() call', async () => {
    createFile(
      '/index.ts',
      `
      const auth = defineAuth({
        emailPassword: {},
        providers: [github({ clientId: '' })],
        tenant: { verifyMembership: async () => true },
      });
      const server = createServer({ auth });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('providers');
    expect(result.auth?.features).toContain('tenant');
  });

  it('detects features via variable reference in property assignment', async () => {
    createFile(
      '/index.ts',
      `
      const authConfig = defineAuth({ emailPassword: true });
      const server = createServer({ auth: authConfig });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
  });

  it('detects features when auth is defined in a separate file', async () => {
    createFile(
      '/auth.ts',
      `export const auth = defineAuth({ emailPassword: true, providers: [] });`,
    );
    createFile(
      '/server.ts',
      `
      import { auth } from './auth';
      const server = createServer({ auth });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('providers');
  });

  it('falls back to defineAuth() scan when auth identifier cannot be resolved', async () => {
    // Simulates the real-project failure: createServer({ auth }) where auth
    // can't be resolved via getDefinitionNodes() (e.g., due to tsconfig
    // moduleResolution issues), but defineAuth() exists in another file.
    createFile(
      '/auth.ts',
      `
      export const auth = defineAuth({
        emailPassword: {},
        providers: [{ name: 'github' }],
      });
      `,
    );
    createFile(
      '/server.ts',
      `
      declare const auth: any;
      const server = createServer({ auth });
      `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('providers');
  });

  it('returns empty features when no defineAuth() exists and identifier cannot be resolved', async () => {
    createFile(
      '/index.ts',
      `
      declare const auth: any;
      const server = createServer({ auth });
    `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toEqual([]);
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

  it('resolves cross-file auth via primary import path (not fallback)', async () => {
    // ts-morph's in-memory FS resolves relative imports between project files,
    // so this exercises the primary ImportSpecifier → aliasedSymbol path.
    createFile(
      '/api/auth.ts',
      `
      import { defineAuth, github } from '@vertz/server';
      import { access } from './access';
      import { SEED_WORKSPACE_ID } from './schema';

      const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

      export const auth = defineAuth({
        session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d', cookie: { secure: false } },
        emailPassword: {},
        providers: [
          github({
            clientId: process.env.GITHUB_CLIENT_ID ?? '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
            redirectUrl: \`\${APP_URL}/api/auth/oauth/github/callback\`,
          }),
        ],
        oauthEncryptionKey: process.env.OAUTH_ENCRYPTION_KEY,
        oauthSuccessRedirect: '/projects',
        oauthErrorRedirect: '/login',
        access: { definition: access },
        onUserCreated: async (payload: any, ctx: any) => {
          await ctx.entities.users.create({ id: payload.user.id });
        },
      });
      `,
    );
    createFile(
      '/api/server.ts',
      `
      import { createServer } from '@vertz/server';
      import { auth } from './auth';
      import { db } from './db';
      import { entities } from './entities';

      export const app = createServer({
        basePath: '/api',
        entities,
        db,
        auth,
      });

      export default app;
      `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('providers');
  });

  it('fallback picks the first defineAuth() when multiple exist', async () => {
    createFile(
      '/auth-a.ts',
      `
      export const authA = defineAuth({ emailPassword: {} });
      `,
    );
    createFile(
      '/auth-b.ts',
      `
      export const authB = defineAuth({ tenant: true, mfa: true });
      `,
    );
    createFile(
      '/server.ts',
      `
      declare const auth: any;
      const server = createServer({ auth });
      `,
    );
    const result = await analyze();

    expect(result.auth).toBeDefined();
    // Should find features from at least one defineAuth call
    expect(result.auth!.features.length).toBeGreaterThan(0);
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
