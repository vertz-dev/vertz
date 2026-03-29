import { beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type ScaffoldOptions, scaffold } from '../index.js';

describe('scaffold', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-scaffold-'));
  });

  const defaultOptions: ScaffoldOptions = { projectName: 'test-app', template: 'todo-app' };

  function projectPath(...segments: string[]): string {
    return path.join(tempDir, 'test-app', ...segments);
  }

  async function exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ── Directory structure ───────────────────────────────────

  describe('directory structure', () => {
    it('creates the project directory with the given name', async () => {
      await scaffold(tempDir, { projectName: 'my-vertz-app', template: 'todo-app' });

      const stat = await fs.stat(path.join(tempDir, 'my-vertz-app'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/api/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('src', 'api'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/api/entities/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('src', 'api', 'entities'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/pages/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('src', 'pages'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/styles/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('src', 'styles'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates .claude/rules/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('.claude', 'rules'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates public/ subdirectory', async () => {
      await scaffold(tempDir, defaultOptions);

      const stat = await fs.stat(projectPath('public'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('does NOT create src/modules/ (removed)', async () => {
      await scaffold(tempDir, defaultOptions);

      expect(await exists(projectPath('src', 'modules'))).toBe(false);
    });

    it('throws error if project directory already exists', async () => {
      await fs.mkdir(path.join(tempDir, 'existing-app'));

      await expect(
        scaffold(tempDir, { projectName: 'existing-app', template: 'todo-app' }),
      ).rejects.toThrow('already exists');
    });
  });

  // ── Config files ──────────────────────────────────────────

  describe('config files', () => {
    it('generates package.json with project name', async () => {
      await scaffold(tempDir, { projectName: 'my-awesome-app', template: 'todo-app' });

      const content = await fs.readFile(
        path.join(tempDir, 'my-awesome-app', 'package.json'),
        'utf-8',
      );
      const pkg = JSON.parse(content);
      expect(pkg.name).toBe('my-awesome-app');
    });

    it('package.json uses vertz meta-package', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.dependencies.vertz).toBeDefined();
    });

    it('package.json includes dev dependencies', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
      expect(pkg.devDependencies['@vertz/ui-compiler']).toBeDefined();
      expect(pkg.devDependencies['bun-types']).toBeDefined();
    });

    it('package.json includes #generated imports map', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.imports['#generated']).toBe('./.vertz/generated/client.ts');
      expect(pkg.imports['#generated/types']).toBe('./.vertz/generated/types/index.ts');
    });

    it('package.json includes vertz dev/build/codegen scripts', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.dev).toBe('vertz dev');
      expect(pkg.scripts.build).toBe('vertz build');
      expect(pkg.scripts.codegen).toBe('vertz codegen');
    });

    it('tsconfig.json includes JSX config for @vertz/ui', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('tsconfig.json'), 'utf-8');
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
      expect(tsconfig.compilerOptions.jsxImportSource).toBe('@vertz/ui');
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.types).toContain('bun-types');
    });

    it('vertz.config.ts includes compiler entry and codegen config', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('vertz.config.ts'), 'utf-8');
      expect(content).toContain("entryFile: 'src/api/server.ts'");
      expect(content).toContain('export const codegen');
      expect(content).toContain("generators: ['typescript']");
    });

    it('.env contains PORT=3000', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('.env'), 'utf-8');
      expect(content).toContain('PORT=3000');
    });

    it('.env.example matches .env', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('.env.example'), 'utf-8');
      expect(content).toContain('PORT=3000');
    });

    it('bunfig.toml registers Vertz compiler plugin for dev server', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('bunfig.toml'), 'utf-8');
      expect(content).toContain('[serve.static]');
      expect(content).toContain('bun-plugin-shim.ts');
    });

    it('bun-plugin-shim.ts bridges createVertzBunPlugin for bunfig.toml', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('bun-plugin-shim.ts'), 'utf-8');
      expect(content).toContain('createVertzBunPlugin');
      expect(content).toContain("from 'vertz/ui-server/bun-plugin'");
      expect(content).toContain('export default plugin');
    });

    it('package.json does not need @vertz/ui-server (provided by vertz meta-package)', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.dependencies.vertz).toBeDefined();
    });

    it('generates public/favicon.svg with Vertz logo on dark background', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('public', 'favicon.svg'), 'utf-8');
      expect(content).toContain('viewBox="0 0 298 298"');
      expect(content).toContain('fill="#0a0a0b"');
    });

    it('.gitignore includes .vertz/ and *.db', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('.gitignore'), 'utf-8');
      expect(content).toContain('.vertz/');
      expect(content).toContain('*.db');
      expect(content).toContain('node_modules');
    });
  });

  // ── API source files ──────────────────────────────────────

  describe('API source files', () => {
    it('generates src/api/server.ts with createServer', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'server.ts'), 'utf-8');
      expect(content).toContain('createServer');
      expect(content).toContain("from 'vertz/server'");
      expect(content).toContain('export default app');
      expect(content).toContain('import.meta.main');
    });

    it('generates src/api/schema.ts with tasks table + model', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'schema.ts'), 'utf-8');
      expect(content).toContain("d.table('tasks'");
      expect(content).toContain('d.model(tasksTable)');
    });

    it('generates src/api/db.ts with createDb and local SQLite path', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'api', 'db.ts'), 'utf-8');
      expect(content).toContain('createDb');
      expect(content).toContain("dialect: 'sqlite'");
      expect(content).toContain('path:');
      expect(content).toContain('autoApply: true');
    });

    it('does NOT generate client.ts inside api/ (client is a UI concern)', async () => {
      await scaffold(tempDir, defaultOptions);

      expect(await exists(projectPath('src', 'api', 'client.ts'))).toBe(false);
    });

    it('generates src/api/entities/tasks.entity.ts', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(
        projectPath('src', 'api', 'entities', 'tasks.entity.ts'),
        'utf-8',
      );
      expect(content).toContain("entity('tasks'");
      expect(content).toContain("from 'vertz/server'");
      expect(content).toContain('tasksModel');
    });
  });

  // ── UI source files ───────────────────────────────────────

  describe('UI source files', () => {
    it('generates src/client.ts with #generated imports', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'client.ts'), 'utf-8');
      expect(content).toContain("from '#generated'");
      expect(content).toContain("from '#generated/types'");
      expect(content).toContain('createClient');
    });

    it('generates src/app.tsx with SSR exports and App component', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'app.tsx'), 'utf-8');
      expect(content).toContain('getInjectedCSS');
      expect(content).toContain('ThemeProvider');
      expect(content).toContain('export function App()');
      expect(content).toContain('HomePage');
    });

    it('generates src/entry-client.ts with mount + HMR', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'entry-client.ts'), 'utf-8');
      expect(content).toContain('mount');
      expect(content).toContain('import.meta.hot.accept()');
    });

    it('generates src/styles/theme.ts with configureTheme and registerTheme', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'styles', 'theme.ts'), 'utf-8');
      expect(content).toContain('configureTheme');
      expect(content).toContain("from '@vertz/theme-shadcn'");
      expect(content).toContain('registerTheme');
      expect(content).not.toContain('themeComponents');
    });

    it('generates src/pages/home.tsx with query + form', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(projectPath('src', 'pages', 'home.tsx'), 'utf-8');
      expect(content).toContain('query');
      expect(content).toContain('tasksQuery.data');
      expect(content).toContain('api.tasks');
      expect(content).toContain('export function HomePage()');
    });
  });

  // ── LLM rules files ─────────────────────────────────────

  describe('LLM rules files', () => {
    it('generates CLAUDE.md with project name', async () => {
      await scaffold(tempDir, { projectName: 'my-cool-app', template: 'todo-app' });

      const content = await fs.readFile(path.join(tempDir, 'my-cool-app', 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('# my-cool-app');
      expect(content).toContain('Vertz');
    });

    it('generates .claude/rules/api-development.md', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(
        projectPath('.claude', 'rules', 'api-development.md'),
        'utf-8',
      );
      expect(content).toContain('entity(');
      expect(content).toContain("from 'vertz/server'");
    });

    it('generates .claude/rules/ui-development.md', async () => {
      await scaffold(tempDir, defaultOptions);

      const content = await fs.readFile(
        projectPath('.claude', 'rules', 'ui-development.md'),
        'utf-8',
      );
      expect(content).toContain('query(');
      expect(content).toContain("from 'vertz/ui'");
      expect(content).toContain('css(');
    });
  });

  // ── Hello World template ────────────────────────────────

  describe('hello-world template', () => {
    const helloOptions: ScaffoldOptions = { projectName: 'test-app', template: 'hello-world' };

    it('creates src/pages/ subdirectory', async () => {
      await scaffold(tempDir, helloOptions);

      const stat = await fs.stat(projectPath('src', 'pages'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/styles/ subdirectory', async () => {
      await scaffold(tempDir, helloOptions);

      const stat = await fs.stat(projectPath('src', 'styles'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates .claude/rules/ subdirectory', async () => {
      await scaffold(tempDir, helloOptions);

      const stat = await fs.stat(projectPath('.claude', 'rules'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates public/ subdirectory', async () => {
      await scaffold(tempDir, helloOptions);

      const stat = await fs.stat(projectPath('public'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('does NOT create src/api/ directory', async () => {
      await scaffold(tempDir, helloOptions);

      expect(await exists(projectPath('src', 'api'))).toBe(false);
    });

    it('does NOT create .env file', async () => {
      await scaffold(tempDir, helloOptions);

      expect(await exists(projectPath('.env'))).toBe(false);
    });

    it('does NOT create src/client.ts', async () => {
      await scaffold(tempDir, helloOptions);

      expect(await exists(projectPath('src', 'client.ts'))).toBe(false);
    });

    it('package.json has no #generated imports', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.imports).toBeUndefined();
    });

    it('package.json has no codegen script', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.codegen).toBeUndefined();
      expect(pkg.scripts.dev).toBe('vertz dev');
      expect(pkg.scripts.build).toBe('vertz build');
    });

    it('package.json has no start script', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.start).toBeUndefined();
    });

    it('vertz.config.ts has no entryFile', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('vertz.config.ts'), 'utf-8');
      expect(content).not.toContain('entryFile');
      expect(content).not.toContain('codegen');
    });

    it('home.tsx has a reactive counter with let', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('src', 'pages', 'home.tsx'), 'utf-8');
      expect(content).toContain('let count = 0');
      expect(content).toContain('count++');
      expect(content).toContain('Hello, Vertz!');
      expect(content).toContain('export function HomePage()');
    });

    it('app.tsx has ThemeProvider, RouterContext.Provider, and RouterView', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('src', 'app.tsx'), 'utf-8');
      expect(content).toContain('ThemeProvider');
      expect(content).toContain('RouterContext.Provider');
      expect(content).toContain('<RouterView');
      expect(content).toContain('appRouter');
      expect(content).toContain('export function App()');
    });

    it('creates src/router.tsx with defineRoutes and createRouter', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('src', 'router.tsx'), 'utf-8');
      expect(content).toContain('defineRoutes');
      expect(content).toContain('createRouter');
      expect(content).toContain("'/'");
      expect(content).toContain("'/about'");
    });

    it('creates src/pages/about.tsx with AboutPage', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('src', 'pages', 'about.tsx'), 'utf-8');
      expect(content).toContain('export function AboutPage()');
    });

    it('creates src/components/ directory', async () => {
      await scaffold(tempDir, helloOptions);

      const stat = await fs.stat(projectPath('src', 'components'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/components/nav-bar.tsx with Link navigation', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('src', 'components', 'nav-bar.tsx'), 'utf-8');
      expect(content).toContain('Link');
      expect(content).toContain('href="/"');
      expect(content).toContain('href="/about"');
    });

    it('CLAUDE.md describes UI-only project', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(projectPath('CLAUDE.md'), 'utf-8');
      expect(content).toContain('# test-app');
      expect(content).toContain('UI-only');
      expect(content).toContain('Adding a Backend');
    });

    it('does NOT generate .claude/rules/api-development.md', async () => {
      await scaffold(tempDir, helloOptions);

      expect(await exists(projectPath('.claude', 'rules', 'api-development.md'))).toBe(false);
    });

    it('generates .claude/rules/ui-development.md', async () => {
      await scaffold(tempDir, helloOptions);

      const content = await fs.readFile(
        projectPath('.claude', 'rules', 'ui-development.md'),
        'utf-8',
      );
      expect(content).toContain('query(');
      expect(content).toContain("from 'vertz/ui'");
    });

    it('reuses shared templates (tsconfig, bunfig, gitignore, theme, favicon)', async () => {
      await scaffold(tempDir, helloOptions);

      // tsconfig
      const tsconfig = JSON.parse(await fs.readFile(projectPath('tsconfig.json'), 'utf-8'));
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');

      // bunfig
      const bunfig = await fs.readFile(projectPath('bunfig.toml'), 'utf-8');
      expect(bunfig).toContain('[serve.static]');

      // gitignore
      const gitignore = await fs.readFile(projectPath('.gitignore'), 'utf-8');
      expect(gitignore).toContain('node_modules');

      // theme
      const theme = await fs.readFile(projectPath('src', 'styles', 'theme.ts'), 'utf-8');
      expect(theme).toContain('configureTheme');

      // favicon
      const favicon = await fs.readFile(projectPath('public', 'favicon.svg'), 'utf-8');
      expect(favicon).toContain('viewBox');
    });

    it('throws error if project directory already exists', async () => {
      await fs.mkdir(path.join(tempDir, 'test-app'));

      await expect(scaffold(tempDir, helloOptions)).rejects.toThrow('already exists');
    });
  });
});
