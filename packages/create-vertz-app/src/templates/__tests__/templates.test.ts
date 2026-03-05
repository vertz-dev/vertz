import { describe, expect, it } from 'bun:test';
import {
  appComponentTemplate,
  bunfigTemplate,
  bunPluginShimTemplate,
  clientTemplate,
  dbTemplate,
  entryClientTemplate,
  envExampleTemplate,
  envTemplate,
  gitignoreTemplate,
  homePageTemplate,
  packageJsonTemplate,
  schemaTemplate,
  serverTemplate,
  tasksEntityTemplate,
  themeTemplate,
  tsconfigTemplate,
  vertzConfigTemplate,
} from '../index.js';

describe('templates', () => {
  describe('packageJsonTemplate', () => {
    it('returns valid JSON', () => {
      const result = packageJsonTemplate('test-app');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('includes project name', () => {
      const result = packageJsonTemplate('my-app');
      const pkg = JSON.parse(result);
      expect(pkg.name).toBe('my-app');
    });

    it('includes full-stack dependencies', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.dependencies['@vertz/server']).toBeDefined();
      expect(pkg.dependencies['@vertz/db']).toBeDefined();
      expect(pkg.dependencies['@vertz/ui']).toBeDefined();
      expect(pkg.dependencies['@vertz/theme-shadcn']).toBeDefined();
    });

    it('includes dev dependencies', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
      expect(pkg.devDependencies['@vertz/ui-compiler']).toBeDefined();
      expect(pkg.devDependencies['@vertz/ui-server']).toBeDefined();
      expect(pkg.devDependencies['bun-types']).toBeDefined();
    });

    it('includes #generated imports map', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.imports['#generated']).toBe('./.vertz/generated/client.ts');
      expect(pkg.imports['#generated/types']).toBe('./.vertz/generated/types/index.ts');
    });

    it('includes vertz dev/build/codegen scripts', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.scripts.dev).toBe('vertz dev');
      expect(pkg.scripts.build).toBe('vertz build');
      expect(pkg.scripts.codegen).toBe('vertz codegen');
    });
  });

  describe('tsconfigTemplate', () => {
    it('returns valid JSON', () => {
      const result = tsconfigTemplate();
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('has strict mode enabled', () => {
      const result = tsconfigTemplate();
      const tsconfig = JSON.parse(result);
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('includes JSX config for @vertz/ui', () => {
      const result = tsconfigTemplate();
      const tsconfig = JSON.parse(result);
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
      expect(tsconfig.compilerOptions.jsxImportSource).toBe('@vertz/ui');
    });

    it('includes bun-types', () => {
      const result = tsconfigTemplate();
      const tsconfig = JSON.parse(result);
      expect(tsconfig.compilerOptions.types).toContain('bun-types');
    });
  });

  describe('vertzConfigTemplate', () => {
    it('exports a default config with compiler entry', () => {
      const result = vertzConfigTemplate();
      expect(result).toContain('export default');
      expect(result).toContain("entryFile: 'src/api/server.ts'");
    });

    it('exports codegen config', () => {
      const result = vertzConfigTemplate();
      expect(result).toContain('export const codegen');
      expect(result).toContain("generators: ['typescript']");
    });
  });

  describe('envTemplate', () => {
    it('contains PORT=3000', () => {
      expect(envTemplate()).toContain('PORT=3000');
    });
  });

  describe('envExampleTemplate', () => {
    it('contains PORT=3000', () => {
      expect(envExampleTemplate()).toContain('PORT=3000');
    });
  });

  describe('bunfigTemplate', () => {
    it('registers bun-plugin-shim.ts under [serve.static]', () => {
      const result = bunfigTemplate();
      expect(result).toContain('[serve.static]');
      expect(result).toContain('bun-plugin-shim.ts');
    });
  });

  describe('bunPluginShimTemplate', () => {
    it('imports createVertzBunPlugin from @vertz/ui-server/bun-plugin', () => {
      const result = bunPluginShimTemplate();
      expect(result).toContain("from '@vertz/ui-server/bun-plugin'");
      expect(result).toContain('createVertzBunPlugin');
    });

    it('exports plugin as default', () => {
      expect(bunPluginShimTemplate()).toContain('export default plugin');
    });
  });

  describe('gitignoreTemplate', () => {
    it('includes standard entries', () => {
      const result = gitignoreTemplate();
      expect(result).toContain('node_modules');
      expect(result).toContain('dist/');
      expect(result).toContain('.vertz/');
      expect(result).toContain('*.db');
    });
  });

  describe('serverTemplate', () => {
    it('uses createServer from @vertz/server', () => {
      const result = serverTemplate();
      expect(result).toContain("from '@vertz/server'");
      expect(result).toContain('createServer');
    });

    it('exports default app', () => {
      expect(serverTemplate()).toContain('export default app');
    });

    it('includes import.meta.main guard', () => {
      expect(serverTemplate()).toContain('import.meta.main');
    });
  });

  describe('schemaTemplate', () => {
    it('defines tasks table with d.table', () => {
      const result = schemaTemplate();
      expect(result).toContain("d.table('tasks'");
      expect(result).toContain('d.model(tasksTable)');
    });
  });

  describe('dbTemplate', () => {
    it('uses createSqliteAdapter', () => {
      const result = dbTemplate();
      expect(result).toContain('createSqliteAdapter');
      expect(result).toContain('autoApply: true');
    });
  });

  describe('tasksEntityTemplate', () => {
    it('defines tasks entity with model and access', () => {
      const result = tasksEntityTemplate();
      expect(result).toContain("entity('tasks'");
      expect(result).toContain('tasksModel');
      expect(result).toContain('list: () => true');
    });
  });

  describe('clientTemplate', () => {
    it('uses #generated imports', () => {
      const result = clientTemplate();
      expect(result).toContain("from '#generated'");
      expect(result).toContain("from '#generated/types'");
      expect(result).toContain('createClient');
    });
  });

  describe('appComponentTemplate', () => {
    it('exports getInjectedCSS for SSR', () => {
      expect(appComponentTemplate()).toContain('getInjectedCSS');
    });

    it('uses ThemeProvider', () => {
      expect(appComponentTemplate()).toContain('ThemeProvider');
    });

    it('renders HomePage', () => {
      expect(appComponentTemplate()).toContain('HomePage');
    });
  });

  describe('entryClientTemplate', () => {
    it('uses mount from @vertz/ui', () => {
      expect(entryClientTemplate()).toContain('mount');
    });

    it('includes HMR self-accept', () => {
      expect(entryClientTemplate()).toContain('import.meta.hot.accept()');
    });
  });

  describe('themeTemplate', () => {
    it('uses configureTheme from @vertz/theme-shadcn', () => {
      const result = themeTemplate();
      expect(result).toContain('configureTheme');
      expect(result).toContain("from '@vertz/theme-shadcn'");
    });
  });

  describe('homePageTemplate', () => {
    it('uses query and queryMatch', () => {
      const result = homePageTemplate();
      expect(result).toContain('query');
      expect(result).toContain('queryMatch');
    });

    it('uses api.tasks', () => {
      expect(homePageTemplate()).toContain('api.tasks');
    });

    it('exports HomePage component', () => {
      expect(homePageTemplate()).toContain('export function HomePage()');
    });
  });

  describe('all templates return non-empty strings', () => {
    it('every template function returns a non-empty string', () => {
      const templates = [
        () => packageJsonTemplate('test'),
        tsconfigTemplate,
        vertzConfigTemplate,
        envTemplate,
        envExampleTemplate,
        gitignoreTemplate,
        bunfigTemplate,
        bunPluginShimTemplate,
        serverTemplate,
        schemaTemplate,
        dbTemplate,
        tasksEntityTemplate,
        clientTemplate,
        appComponentTemplate,
        entryClientTemplate,
        themeTemplate,
        homePageTemplate,
      ];

      for (const template of templates) {
        const result = template();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
