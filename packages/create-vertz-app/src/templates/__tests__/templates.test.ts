import { describe, expect, it } from 'vitest';
import {
  appTemplate,
  denoConfigTemplate,
  envExampleTemplate,
  envSrcTemplate,
  envTemplate,
  gitignoreTemplate,
  healthCheckSchemaTemplate,
  healthModuleDefTemplate,
  healthModuleTemplate,
  healthRouterTemplate,
  healthServiceTemplate,
  mainTemplate,
  packageJsonTemplate,
  requestIdMiddlewareTemplate,
  tsconfigTemplate,
  vertzConfigTemplate,
} from '../index.js';

describe('templates', () => {
  describe('packageJsonTemplate', () => {
    it('returns valid JSON', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('includes project name', () => {
      const result = packageJsonTemplate({ projectName: 'my-app', runtime: 'bun' });
      const pkg = JSON.parse(result);
      expect(pkg.name).toBe('my-app');
    });

    it('includes @vertz/core dependency', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
      const pkg = JSON.parse(result);
      expect(pkg.dependencies['@vertz/core']).toBeDefined();
    });

    it('includes @vertz/cli as dev dependency', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
      const pkg = JSON.parse(result);
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
    });

    it('includes required scripts', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
      const pkg = JSON.parse(result);
      expect(pkg.scripts.dev).toBeDefined();
      expect(pkg.scripts.build).toBeDefined();
      expect(pkg.scripts.check).toBeDefined();
    });

    it('uses bun scripts for bun runtime', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
      const pkg = JSON.parse(result);
      expect(pkg.scripts.dev).toContain('bun');
    });

    it('uses tsx for node runtime', () => {
      const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'node' });
      const pkg = JSON.parse(result);
      expect(pkg.scripts.dev).toContain('tsx');
      expect(pkg.dependencies.tsx).toBeDefined();
    });

    // Tests for runtime-specific type dependencies
    describe('runtime-specific type dependencies', () => {
      it('adds bun-types to devDependencies for bun runtime', () => {
        const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'bun' });
        const pkg = JSON.parse(result);
        expect(pkg.devDependencies['bun-types']).toBeDefined();
        expect(pkg.devDependencies['bun-types']).toMatch(/^\^1\./);
      });

      it('adds @types/node to devDependencies for node runtime', () => {
        const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'node' });
        const pkg = JSON.parse(result);
        expect(pkg.devDependencies['@types/node']).toBeDefined();
        expect(pkg.devDependencies['@types/node']).toMatch(/^\^20\./);
      });

      it('does not add type packages for deno runtime', () => {
        const result = packageJsonTemplate({ projectName: 'test-app', runtime: 'deno' });
        const pkg = JSON.parse(result);
        expect(pkg.devDependencies['bun-types']).toBeUndefined();
        expect(pkg.devDependencies['@types/node']).toBeUndefined();
      });
    });
  });

  describe('tsconfigTemplate', () => {
    it('returns valid JSON', () => {
      const result = tsconfigTemplate('bun');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('has strict mode enabled', () => {
      const result = tsconfigTemplate('bun');
      const tsconfig = JSON.parse(result);
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    // Tests for runtime-specific types in tsconfig
    describe('runtime-specific types', () => {
      it('includes bun-types in tsconfig for bun runtime', () => {
        const result = tsconfigTemplate('bun');
        const tsconfig = JSON.parse(result);
        expect(tsconfig.compilerOptions.types).toContain('bun-types');
      });

      it('includes node types in tsconfig for node runtime', () => {
        const result = tsconfigTemplate('node');
        const tsconfig = JSON.parse(result);
        expect(tsconfig.compilerOptions.types).toContain('node');
        expect(tsconfig.compilerOptions.types).not.toContain('bun-types');
      });

      it('has empty types array for deno runtime', () => {
        const result = tsconfigTemplate('deno');
        const tsconfig = JSON.parse(result);
        // Deno has built-in types, so types should be empty or undefined
        expect(tsconfig.compilerOptions.types).toEqual([]);
      });
    });
  });

  describe('vertzConfigTemplate', () => {
    it('returns non-empty string', () => {
      const result = vertzConfigTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('exports a default config', () => {
      const result = vertzConfigTemplate();
      expect(result).toContain('export default');
    });
  });

  describe('envTemplate', () => {
    it('returns non-empty string', () => {
      const result = envTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes DATABASE_URL placeholder', () => {
      const result = envTemplate();
      expect(result).toContain('DATABASE_URL=');
    });
  });

  describe('envExampleTemplate', () => {
    it('returns non-empty string', () => {
      const result = envExampleTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('matches env template structure', () => {
      const result = envExampleTemplate();
      expect(result).toContain('DATABASE_URL=');
    });
  });

  describe('gitignoreTemplate', () => {
    it('returns non-empty string', () => {
      const result = gitignoreTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes node_modules', () => {
      const result = gitignoreTemplate();
      expect(result).toContain('node_modules');
    });

    it('includes dist/', () => {
      const result = gitignoreTemplate();
      expect(result).toContain('dist/');
    });
  });

  describe('envSrcTemplate', () => {
    it('returns non-empty string', () => {
      const result = envSrcTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('uses envsafe for validation', () => {
      const result = envSrcTemplate();
      expect(result).toContain('envsafe');
    });
  });

  describe('appTemplate', () => {
    it('returns non-empty string', () => {
      const result = appTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('exports createApp', () => {
      const result = appTemplate();
      expect(result).toContain('createApp');
    });
  });

  describe('mainTemplate', () => {
    it('returns non-empty string', () => {
      const result = mainTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('starts the app', () => {
      const result = mainTemplate();
      expect(result).toContain('app.start');
    });
  });

  describe('requestIdMiddlewareTemplate', () => {
    it('returns non-empty string', () => {
      const result = requestIdMiddlewareTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles requestId', () => {
      const result = requestIdMiddlewareTemplate();
      expect(result).toContain('requestId');
    });
  });

  describe('health module templates', () => {
    it('healthModuleDefTemplate returns non-empty string', () => {
      const result = healthModuleDefTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('healthModuleTemplate returns non-empty string', () => {
      const result = healthModuleTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('healthServiceTemplate returns non-empty string', () => {
      const result = healthServiceTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('healthRouterTemplate returns non-empty string', () => {
      const result = healthRouterTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('healthCheckSchemaTemplate returns non-empty string', () => {
      const result = healthCheckSchemaTemplate();
      expect(result.length).toBeGreaterThan(0);
    });

    it('templates include helpful comments for new users', () => {
      const serviceResult = healthServiceTemplate();
      expect(serviceResult).toContain('In a real app');
    });
  });

  describe('denoConfigTemplate', () => {
    it('returns valid JSON', () => {
      const result = denoConfigTemplate();
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('includes imports', () => {
      const result = denoConfigTemplate();
      const config = JSON.parse(result);
      expect(config.imports).toBeDefined();
    });
  });

  describe('all templates return non-empty strings', () => {
    it('every template function returns a non-empty string', () => {
      const templates = [
        () => packageJsonTemplate({ projectName: 'test', runtime: 'bun' }),
        () => tsconfigTemplate('bun'),
        vertzConfigTemplate,
        envTemplate,
        envExampleTemplate,
        gitignoreTemplate,
        envSrcTemplate,
        appTemplate,
        mainTemplate,
        requestIdMiddlewareTemplate,
        healthModuleDefTemplate,
        healthModuleTemplate,
        healthServiceTemplate,
        healthRouterTemplate,
        healthCheckSchemaTemplate,
        denoConfigTemplate,
      ];

      for (const template of templates) {
        const result = template();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
