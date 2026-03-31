import { beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScaffoldOptions } from '../types.js';
import { scaffold } from '../scaffold.js';

describe('scaffold: api template', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-scaffold-api-'));
  });

  const apiOptions: ScaffoldOptions = { projectName: 'test-api', template: 'api' };

  function projectPath(...segments: string[]): string {
    return path.join(tempDir, 'test-api', ...segments);
  }

  async function exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ── API files present ─────────────────────────────────────

  describe('API files present', () => {
    it('creates src/api/server.ts with createServer', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'server.ts'), 'utf-8');
      expect(content).toContain('createServer');
      expect(content).toContain("from 'vertz/server'");
      expect(content).toContain('export default app');
    });

    it('creates src/api/schema.ts', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'schema.ts'), 'utf-8');
      expect(content).toContain("d.table('tasks'");
    });

    it('creates src/api/db.ts', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'db.ts'), 'utf-8');
      expect(content).toContain('createDb');
    });

    it('creates src/api/entities/tasks.entity.ts', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(
        projectPath('src', 'api', 'entities', 'tasks.entity.ts'),
        'utf-8',
      );
      expect(content).toContain("entity('tasks'");
    });

    it('creates src/api/env.ts', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'env.ts'), 'utf-8');
      expect(content).toContain('createEnv');
    });

    it('creates vertz.config.ts with entryFile', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('vertz.config.ts'), 'utf-8');
      expect(content).toContain("entryFile: 'src/api/server.ts'");
    });

    it('creates .env', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('.env'), 'utf-8');
      expect(content).toContain('PORT=3000');
    });

    it('creates .claude/rules/api-development.md', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('.claude', 'rules', 'api-development.md'))).toBe(true);
    });
  });

  // ── UI files NOT present ──────────────────────────────────

  describe('UI files NOT present', () => {
    it('does NOT create src/app.tsx', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('src', 'app.tsx'))).toBe(false);
    });

    it('does NOT create src/entry-client.ts', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('src', 'entry-client.ts'))).toBe(false);
    });

    it('does NOT create src/styles/', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('src', 'styles'))).toBe(false);
    });

    it('does NOT create src/pages/', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('src', 'pages'))).toBe(false);
    });

    it('does NOT create public/', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('public'))).toBe(false);
    });

    it('does NOT create bunfig.toml', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('bunfig.toml'))).toBe(false);
    });

    it('does NOT create bun-plugin-shim.ts', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('bun-plugin-shim.ts'))).toBe(false);
    });

    it('does NOT create src/client.ts', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('src', 'client.ts'))).toBe(false);
    });

    it('does NOT create .claude/rules/ui-development.md', async () => {
      await scaffold(tempDir, apiOptions);

      expect(await exists(projectPath('.claude', 'rules', 'ui-development.md'))).toBe(false);
    });
  });

  // ── Package.json ──────────────────────────────────────────

  describe('package.json', () => {
    it('has project name', async () => {
      await scaffold(tempDir, apiOptions);

      const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
      expect(pkg.name).toBe('test-api');
    });

    it('has vertz dependency but NOT @vertz/theme-shadcn', async () => {
      await scaffold(tempDir, apiOptions);

      const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
      expect(pkg.dependencies.vertz).toBeDefined();
      expect(pkg.dependencies['@vertz/theme-shadcn']).toBeUndefined();
    });

    it('has @vertz/cli but NOT @vertz/ui-compiler', async () => {
      await scaffold(tempDir, apiOptions);

      const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
      expect(pkg.devDependencies['@vertz/ui-compiler']).toBeUndefined();
    });

    it('has start and codegen scripts but NOT dev/build', async () => {
      await scaffold(tempDir, apiOptions);

      const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
      expect(pkg.scripts.start).toBe('vertz start');
      expect(pkg.scripts.codegen).toBe('vertz codegen');
    });

    it('has no #generated imports', async () => {
      await scaffold(tempDir, apiOptions);

      const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
      expect(pkg.imports).toBeUndefined();
    });
  });

  // ── CLAUDE.md ─────────────────────────────────────────────

  describe('CLAUDE.md', () => {
    it('describes API-only project', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('CLAUDE.md'), 'utf-8');
      expect(content).toContain('# test-api');
      expect(content).toContain('API-only');
    });

    it('does NOT mention routing', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('CLAUDE.md'), 'utf-8');
      expect(content).not.toContain('router');
      expect(content).not.toContain('Routing');
    });

    it('does NOT mention Vertz compiler reactivity', async () => {
      await scaffold(tempDir, apiOptions);

      const content = await fs.readFile(projectPath('CLAUDE.md'), 'utf-8');
      expect(content).not.toContain('.value');
      expect(content).not.toContain('signal()');
    });
  });
});

describe('scaffold: --with custom composition', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-scaffold-with-'));
  });

  it('scaffolds api + ui without router or client', async () => {
    await scaffold(tempDir, {
      projectName: 'custom-app',
      template: 'todo-app', // ignored when withFeatures present
      withFeatures: ['api', 'ui'],
    });

    const projectDir = path.join(tempDir, 'custom-app');

    // Has both API and UI files
    const serverExists = await fs.access(path.join(projectDir, 'src', 'api', 'server.ts')).then(() => true).catch(() => false);
    const appExists = await fs.access(path.join(projectDir, 'src', 'app.tsx')).then(() => true).catch(() => false);
    expect(serverExists).toBe(true);
    expect(appExists).toBe(true);

    // No router or client
    const routerExists = await fs.access(path.join(projectDir, 'src', 'router.tsx')).then(() => true).catch(() => false);
    const clientExists = await fs.access(path.join(projectDir, 'src', 'client.ts')).then(() => true).catch(() => false);
    expect(routerExists).toBe(false);
    expect(clientExists).toBe(false);
  });

  it('auto-resolves transitive dependencies', async () => {
    await scaffold(tempDir, {
      projectName: 'transitive-app',
      template: 'todo-app',
      withFeatures: ['entity-example'],
    });

    const projectDir = path.join(tempDir, 'transitive-app');

    // entity-example → db → api → core: all should exist
    const serverExists = await fs.access(path.join(projectDir, 'src', 'api', 'server.ts')).then(() => true).catch(() => false);
    const schemaExists = await fs.access(path.join(projectDir, 'src', 'api', 'schema.ts')).then(() => true).catch(() => false);
    const entityExists = await fs.access(path.join(projectDir, 'src', 'api', 'entities', 'tasks.entity.ts')).then(() => true).catch(() => false);
    const tsconfigExists = await fs.access(path.join(projectDir, 'tsconfig.json')).then(() => true).catch(() => false);

    expect(serverExists).toBe(true);
    expect(schemaExists).toBe(true);
    expect(entityExists).toBe(true);
    expect(tsconfigExists).toBe(true);
  });
});

describe('scaffold: full-stack template', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-scaffold-fs-'));
  });

  const fsOptions: ScaffoldOptions = { projectName: 'test-fs', template: 'full-stack' };

  function projectPath(...segments: string[]): string {
    return path.join(tempDir, 'test-fs', ...segments);
  }

  async function exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  it('has both API and UI files', async () => {
    await scaffold(tempDir, fsOptions);

    expect(await exists(projectPath('src', 'api', 'server.ts'))).toBe(true);
    expect(await exists(projectPath('src', 'app.tsx'))).toBe(true);
    expect(await exists(projectPath('src', 'entry-client.ts'))).toBe(true);
  });

  it('has router (unlike todo-app)', async () => {
    await scaffold(tempDir, fsOptions);

    expect(await exists(projectPath('src', 'router.tsx'))).toBe(true);
    expect(await exists(projectPath('src', 'pages', 'about.tsx'))).toBe(true);
    expect(await exists(projectPath('src', 'components', 'nav-bar.tsx'))).toBe(true);
  });

  it('has client with #generated imports', async () => {
    await scaffold(tempDir, fsOptions);

    expect(await exists(projectPath('src', 'client.ts'))).toBe(true);

    const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
    expect(pkg.imports['#generated']).toBe('./.vertz/generated/client.ts');
  });

  it('has all scripts (dev, build, start, codegen)', async () => {
    await scaffold(tempDir, fsOptions);

    const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
    expect(pkg.scripts.dev).toBe('vertz dev');
    expect(pkg.scripts.build).toBe('vertz build');
    expect(pkg.scripts.start).toBe('vertz start');
    expect(pkg.scripts.codegen).toBe('vertz codegen');
  });

  it('has both theme and CLI deps', async () => {
    await scaffold(tempDir, fsOptions);

    const pkg = JSON.parse(await fs.readFile(projectPath('package.json'), 'utf-8'));
    expect(pkg.dependencies['@vertz/theme-shadcn']).toBeDefined();
    expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
    expect(pkg.devDependencies['@vertz/ui-compiler']).toBeDefined();
  });

  it('app.tsx has RouterContext.Provider and RouterView', async () => {
    await scaffold(tempDir, fsOptions);

    const content = await fs.readFile(projectPath('src', 'app.tsx'), 'utf-8');
    expect(content).toContain('RouterContext.Provider');
    expect(content).toContain('RouterView');
    expect(content).toContain('appRouter');
  });

  it('CLAUDE.md describes full-stack project', async () => {
    await scaffold(tempDir, fsOptions);

    const content = await fs.readFile(projectPath('CLAUDE.md'), 'utf-8');
    expect(content).toContain('full-stack');
    expect(content).toContain('Routing');
  });

  it('has both api and ui development rules', async () => {
    await scaffold(tempDir, fsOptions);

    expect(await exists(projectPath('.claude', 'rules', 'api-development.md'))).toBe(true);
    expect(await exists(projectPath('.claude', 'rules', 'ui-development.md'))).toBe(true);
  });
});
