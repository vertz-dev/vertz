import { describe, expect, it } from 'bun:test';
import {
  apiDevelopmentRuleTemplate,
  appComponentTemplate,
  bunfigTemplate,
  bunPluginShimTemplate,
  claudeMdTemplate,
  clientTemplate,
  dbTemplate,
  entryClientTemplate,
  envExampleTemplate,
  envModuleTemplate,
  envTemplate,
  gitignoreTemplate,
  homePageTemplate,
  packageJsonTemplate,
  schemaTemplate,
  serverTemplate,
  tasksEntityTemplate,
  themeTemplate,
  tsconfigTemplate,
  uiDevelopmentRuleTemplate,
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

    it('uses vertz meta-package as single dependency', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.dependencies.vertz).toBeDefined();
    });

    it('includes dev dependencies', () => {
      const result = packageJsonTemplate('test-app');
      const pkg = JSON.parse(result);
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
      expect(pkg.devDependencies['@vertz/ui-compiler']).toBeDefined();
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
    it('imports createVertzBunPlugin from vertz/ui-server/bun-plugin', () => {
      const result = bunPluginShimTemplate();
      expect(result).toContain("from 'vertz/ui-server/bun-plugin'");
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

  describe('envModuleTemplate', () => {
    it('uses createEnv from vertz/server', () => {
      const result = envModuleTemplate();
      expect(result).toContain("from 'vertz/server'");
      expect(result).toContain('createEnv');
    });

    it('defines a schema with PORT and DATABASE_URL', () => {
      const result = envModuleTemplate();
      expect(result).toContain('PORT');
      expect(result).toContain('DATABASE_URL');
    });

    it('exports env as a named export', () => {
      expect(envModuleTemplate()).toContain('export const env');
    });
  });

  describe('serverTemplate', () => {
    it('uses createServer from vertz/server', () => {
      const result = serverTemplate();
      expect(result).toContain("from 'vertz/server'");
      expect(result).toContain('createServer');
    });

    it('imports env from ./env', () => {
      expect(serverTemplate()).toContain("from './env'");
    });

    it('uses env.PORT instead of process.env', () => {
      const result = serverTemplate();
      expect(result).toContain('env.PORT');
      expect(result).not.toContain('process.env');
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

    it('requires non-empty title with min(1)', () => {
      const result = schemaTemplate();
      expect(result).toContain('d.text().min(1)');
    });
  });

  describe('dbTemplate', () => {
    it('uses createDb with local SQLite path', () => {
      const result = dbTemplate();
      expect(result).toContain('createDb');
      expect(result).toContain("dialect: 'sqlite'");
      expect(result).toContain('path:');
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

    it('uses registerTheme to register the theme globally', () => {
      const result = themeTemplate();
      expect(result).toContain('registerTheme');
      expect(result).toContain('registerTheme(config)');
    });

    it('does not export themeComponents', () => {
      const result = themeTemplate();
      expect(result).not.toContain('themeComponents');
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

    it('uses form() API for task creation instead of manual submit', () => {
      const result = homePageTemplate();
      expect(result).toContain('form(api.tasks.create');
      expect(result).toContain('resetOnSuccess: true');
      expect(result).not.toContain('handleSubmit');
    });

    it('imports form from vertz/ui', () => {
      const result = homePageTemplate();
      expect(result).toContain('form,');
    });

    it('uses form fields for input name binding', () => {
      const result = homePageTemplate();
      expect(result).toContain('taskForm.fields.title');
    });

    it('uses form action/method/onSubmit on the form element', () => {
      const result = homePageTemplate();
      expect(result).toContain('taskForm.action');
      expect(result).toContain('taskForm.method');
      expect(result).toContain('taskForm.onSubmit');
    });

    it('shows per-field validation errors', () => {
      const result = homePageTemplate();
      expect(result).toContain('taskForm.title.error');
    });

    it('disables submit button during submission', () => {
      const result = homePageTemplate();
      expect(result).toContain('taskForm.submitting');
    });

    it('uses theme components from @vertz/ui/components', () => {
      const result = homePageTemplate();
      expect(result).toContain("from '@vertz/ui/components'");
      expect(result).toContain('<Button');
      expect(result).not.toContain('themeComponents');
    });

    it('includes TaskItem component with checkbox toggle', () => {
      const result = homePageTemplate();
      expect(result).toContain('function TaskItem(');
      expect(result).toContain('type="checkbox"');
      expect(result).toContain('api.tasks.update');
    });

    it('uses dialogs.confirm() for delete confirmation', () => {
      const result = homePageTemplate();
      expect(result).toContain('api.tasks.delete');
      expect(result).toContain('dialogs.confirm');
      expect(result).toContain('useDialogStack');
    });

    it('shows remaining task count', () => {
      const result = homePageTemplate();
      expect(result).toContain('remaining');
      expect(result).toContain('.filter');
      expect(result).toContain('!t.completed');
    });

    it('has hover state on task items', () => {
      const result = homePageTemplate();
      expect(result).toContain('hover:bg:accent');
    });

    it('uses ListTransition for animated list', () => {
      const result = homePageTemplate();
      expect(result).toContain('ListTransition');
      expect(result).toContain('slideInFromTop');
      expect(result).toContain('fadeOut');
    });

    it('relies on automatic cache invalidation (no manual refetch)', () => {
      const result = homePageTemplate();
      expect(result).not.toContain('refetch');
    });
  });

  describe('claudeMdTemplate', () => {
    it('includes the project name', () => {
      const result = claudeMdTemplate('my-app');
      expect(result).toContain('# my-app');
    });

    it('includes Vertz as the framework', () => {
      const result = claudeMdTemplate('test-app');
      expect(result).toContain('Vertz');
    });

    it('includes dev commands', () => {
      const result = claudeMdTemplate('test-app');
      expect(result).toContain('bun run dev');
      expect(result).toContain('bun run build');
    });

    it('points to docs.vertz.dev', () => {
      const result = claudeMdTemplate('test-app');
      expect(result).toContain('docs.vertz.dev');
    });

    it('points to .claude/rules/ for conventions', () => {
      const result = claudeMdTemplate('test-app');
      expect(result).toContain('.claude/rules/');
    });
  });

  describe('apiDevelopmentRuleTemplate', () => {
    it('documents entity definition pattern', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('entity(');
      expect(result).toContain('model:');
      expect(result).toContain('access:');
    });

    it('documents table and model definition', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('d.table(');
      expect(result).toContain('d.model(');
    });

    it('documents schema validation with s.*', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('s.object(');
      expect(result).toContain('s.string()');
    });

    it('documents import paths from vertz meta-package', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain("from 'vertz/server'");
      expect(result).toContain("from 'vertz/schema'");
      expect(result).toContain("from 'vertz/db'");
    });

    it('documents createServer pattern', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('createServer');
      expect(result).toContain('entities:');
    });

    it('documents createEnv for environment variables', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('createEnv');
    });

    it('documents schemas are for custom actions only', () => {
      const result = apiDevelopmentRuleTemplate();
      expect(result).toContain('Custom Actions');
      expect(result).toContain('automatically');
    });
  });

  describe('uiDevelopmentRuleTemplate', () => {
    it('documents component signature conventions', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('Destructure props');
    });

    it('documents reactivity model with let and const', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('`let`');
      expect(result).toContain('`const`');
      expect(result).toContain('signal');
      expect(result).toContain('computed');
    });

    it('documents automatic cache invalidation', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('Automatic Cache Invalidation');
    });

    it('does not reference .value', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).not.toContain('.value');
    });

    it('does not reference watch()', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).not.toContain('watch(');
      expect(result).not.toContain('watch()');
    });

    it('documents query() for data fetching', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('query(');
      expect(result).toContain('queryMatch(');
    });

    it('documents css() for styling and theme components', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('css(');
      expect(result).toContain('@vertz/ui/components');
      expect(result).toContain('useDialogStack');
    });

    it('documents JSX conventions', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('JSX');
      expect(result).toContain('declarative');
    });

    it('documents imports from vertz/ui', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain("from 'vertz/ui'");
    });

    it('documents useRouter for navigation', () => {
      const result = uiDevelopmentRuleTemplate();
      expect(result).toContain('useRouter');
    });
  });

  describe('all templates return non-empty strings', () => {
    it('every template function returns a non-empty string', () => {
      const templates = [
        () => packageJsonTemplate('test'),
        () => claudeMdTemplate('test'),
        tsconfigTemplate,
        vertzConfigTemplate,
        envTemplate,
        envExampleTemplate,
        envModuleTemplate,
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
        apiDevelopmentRuleTemplate,
        uiDevelopmentRuleTemplate,
      ];

      for (const template of templates) {
        const result = template();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
