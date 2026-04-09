import { describe, expect, it } from '@vertz/test';
import { Project } from 'ts-morph';
import { AuthAnalyzer } from '../analyzers/auth-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('AuthAnalyzer', () => {
  it('returns undefined when no createServer call exists', async () => {
    const project = createProject({
      'src/app.ts': 'export const x = 1;',
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeUndefined();
  });

  it('detects auth features from inline config', async () => {
    const project = createProject({
      'src/app.ts': `
        function createServer(config: any) { return config; }
        createServer({
          auth: {
            emailPassword: { enabled: true },
            tenant: { enabled: true },
          },
        });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('tenant');
  });

  it('resolves auth from a variable reference (Identifier path)', async () => {
    const project = createProject({
      'src/app.ts': `
        function createServer(config: any) { return config; }
        const authConfig = {
          emailPassword: { enabled: true },
          mfa: { enabled: true },
        };
        createServer({ auth: authConfig });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailPassword');
    expect(result.auth?.features).toContain('mfa');
  });

  it('resolves auth from a wrapper call expression like defineAuth()', async () => {
    const project = createProject({
      'src/app.ts': `
        function createServer(config: any) { return config; }
        function defineAuth(config: any) { return config; }
        createServer({
          auth: defineAuth({
            providers: { google: {} },
          }),
        });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('providers');
  });

  it('resolves auth through imported variable reference', async () => {
    const project = createProject({
      'src/auth-config.ts': `
        export const authConfig = {
          emailVerification: { enabled: true },
          passwordReset: { enabled: true },
        };
      `,
      'src/app.ts': `
        import { authConfig } from './auth-config';
        function createServer(config: any) { return config; }
        createServer({ auth: authConfig });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toContain('emailVerification');
    expect(result.auth?.features).toContain('passwordReset');
  });

  it('returns empty features when auth is not an object literal', async () => {
    const project = createProject({
      'src/app.ts': `
        function createServer(config: any) { return config; }
        createServer({ auth: true });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeDefined();
    expect(result.auth?.features).toEqual([]);
  });

  it('ignores non-identifier createServer calls (e.g., obj.createServer)', async () => {
    const project = createProject({
      'src/app.ts': `
        const obj = { createServer: (config: any) => config };
        obj.createServer({ auth: { emailPassword: {} } });
      `,
    });
    const analyzer = new AuthAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.auth).toBeUndefined();
  });
});
