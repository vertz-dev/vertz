import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { type ScaffoldOptions, scaffold } from '../index.js';

describe('scaffold', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertz-scaffold-'));
  });

  describe('directory structure', () => {
    it('creates the project directory with the given name', async () => {
      const options: ScaffoldOptions = {
        projectName: 'my-vertz-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const projectPath = path.join(tempDir, 'my-vertz-app');
      const stat = await fs.stat(projectPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/ subdirectory', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const srcPath = path.join(tempDir, 'test-app', 'src');
      const stat = await fs.stat(srcPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/modules/ subdirectory', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const modulesPath = path.join(tempDir, 'test-app', 'src', 'modules');
      const stat = await fs.stat(modulesPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates src/middlewares/ subdirectory', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const middlewaresPath = path.join(tempDir, 'test-app', 'src', 'middlewares');
      const stat = await fs.stat(middlewaresPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('throws error if project directory already exists', async () => {
      const projectPath = path.join(tempDir, 'existing-app');
      await fs.mkdir(projectPath);

      const options: ScaffoldOptions = {
        projectName: 'existing-app',
        runtime: 'bun',
        includeExample: false,
      };

      await expect(scaffold(tempDir, options)).rejects.toThrow('already exists');
    });
  });

  describe('core files', () => {
    it('generates package.json with project name', async () => {
      const options: ScaffoldOptions = {
        projectName: 'my-awesome-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'my-awesome-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.name).toBe('my-awesome-app');
    });

    it('package.json includes @vertz/core as dependency', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.dependencies['@vertz/core']).toBeDefined();
    });

    it('package.json includes @vertz/cli as dev dependency', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies['@vertz/cli']).toBeDefined();
    });

    it('package.json includes scripts: dev, build, check', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.dev).toBeDefined();
      expect(pkg.scripts.build).toBeDefined();
      expect(pkg.scripts.check).toBeDefined();
    });

    it('generates tsconfig.json with strict TypeScript config', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const tsconfigPath = path.join(tempDir, 'test-app', 'tsconfig.json');
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('generates vertz.config.ts with default config', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const configPath = path.join(tempDir, 'test-app', 'vertz.config.ts');
      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('export default');
    });

    it('generates .env file with placeholder values', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const envPath = path.join(tempDir, 'test-app', '.env');
      const content = await fs.readFile(envPath, 'utf-8');
      expect(content).toContain('DATABASE_URL=');
    });

    it('generates .env.example matching .env structure', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const envPath = path.join(tempDir, 'test-app', '.env.example');
      const content = await fs.readFile(envPath, 'utf-8');
      expect(content).toContain('DATABASE_URL=');
    });

    it('generates .gitignore with standard entries', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const gitignorePath = path.join(tempDir, 'test-app', '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      expect(content).toContain('node_modules');
      expect(content).toContain('dist/');
    });
  });

  describe('source files', () => {
    it('generates src/env.ts with environment variable validation', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const envPath = path.join(tempDir, 'test-app', 'src', 'env.ts');
      const content = await fs.readFile(envPath, 'utf-8');
      expect(content).toContain('envsafe');
    });

    it('generates src/app.ts with app creation', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const appPath = path.join(tempDir, 'test-app', 'src', 'app.ts');
      const content = await fs.readFile(appPath, 'utf-8');
      expect(content).toContain('createApp');
    });

    it('generates src/main.ts as the entry point', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const mainPath = path.join(tempDir, 'test-app', 'src', 'main.ts');
      const content = await fs.readFile(mainPath, 'utf-8');
      expect(content).toContain('app.start');
    });

    it('generates src/middlewares/request-id.middleware.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const middlewarePath = path.join(
        tempDir,
        'test-app',
        'src',
        'middlewares',
        'request-id.middleware.ts',
      );
      const content = await fs.readFile(middlewarePath, 'utf-8');
      expect(content).toContain('requestId');
    });
  });

  describe('example module (opt-in)', () => {
    it('when example is enabled: generates health module files', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const moduleDefPath = path.join(
        tempDir,
        'test-app',
        'src',
        'modules',
        'health.module-def.ts',
      );
      const content = await fs.readFile(moduleDefPath, 'utf-8');
      expect(content).toContain('health');
    });

    it('Health module includes health.module-def.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const pathExists = await exists(
        path.join(tempDir, 'test-app', 'src', 'modules', 'health.module-def.ts'),
      );
      expect(pathExists).toBe(true);
    });

    it('Health module includes health.module.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const pathExists = await exists(
        path.join(tempDir, 'test-app', 'src', 'modules', 'health.module.ts'),
      );
      expect(pathExists).toBe(true);
    });

    it('Health module includes health.service.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const pathExists = await exists(
        path.join(tempDir, 'test-app', 'src', 'modules', 'health.service.ts'),
      );
      expect(pathExists).toBe(true);
    });

    it('Health module includes health.router.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const pathExists = await exists(
        path.join(tempDir, 'test-app', 'src', 'modules', 'health.router.ts'),
      );
      expect(pathExists).toBe(true);
    });

    it('Health module includes schemas/health-check.schema.ts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      await scaffold(tempDir, options);

      const pathExists = await exists(
        path.join(tempDir, 'test-app', 'src', 'modules', 'schemas', 'health-check.schema.ts'),
      );
      expect(pathExists).toBe(true);
    });

    it('when example is disabled: src/modules/ exists but is empty', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const modulesPath = path.join(tempDir, 'test-app', 'src', 'modules');
      const files = await fs.readdir(modulesPath);
      expect(files.length).toBe(0);
    });
  });

  describe('runtime configuration', () => {
    it('Bun runtime: package.json uses Bun-appropriate scripts', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.dev).toContain('bun');
      expect(pkg.scripts.build).toContain('bun');
    });

    it('Node runtime: package.json uses Node-appropriate scripts (tsx for dev)', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'node',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.dev).toContain('tsx');
      expect(pkg.dependencies).toHaveProperty('tsx');
    });

    it('Deno runtime: generates deno.json instead of some Node-specific configs', async () => {
      const options: ScaffoldOptions = {
        projectName: 'test-app',
        runtime: 'deno',
        includeExample: false,
      };

      await scaffold(tempDir, options);

      const denoJsonPath = path.join(tempDir, 'test-app', 'deno.json');
      const content = await fs.readFile(denoJsonPath, 'utf-8');
      const denoConfig = JSON.parse(content);
      expect(denoConfig.imports).toBeDefined();
    });

    // Tests for runtime-specific type dependencies in scaffolded project
    describe('runtime-specific type dependencies', () => {
      it('Bun runtime: scaffolded package.json includes bun-types', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'bun',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
        const content = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        expect(pkg.devDependencies['bun-types']).toBeDefined();
      });

      it('Node runtime: scaffolded package.json includes @types/node', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'node',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
        const content = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        expect(pkg.devDependencies['@types/node']).toBeDefined();
      });

      it('Deno runtime: scaffolded package.json does not include type packages', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'deno',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const pkgJsonPath = path.join(tempDir, 'test-app', 'package.json');
        const content = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        expect(pkg.devDependencies['bun-types']).toBeUndefined();
        expect(pkg.devDependencies['@types/node']).toBeUndefined();
      });

      it('Bun runtime: tsconfig.json includes bun-types', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'bun',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const tsconfigPath = path.join(tempDir, 'test-app', 'tsconfig.json');
        const content = await fs.readFile(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(content);
        expect(tsconfig.compilerOptions.types).toContain('bun-types');
      });

      it('Node runtime: tsconfig.json includes node types', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'node',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const tsconfigPath = path.join(tempDir, 'test-app', 'tsconfig.json');
        const content = await fs.readFile(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(content);
        expect(tsconfig.compilerOptions.types).toContain('node');
        expect(tsconfig.compilerOptions.types).not.toContain('bun-types');
      });

      it('Deno runtime: tsconfig.json has empty types array', async () => {
        const options: ScaffoldOptions = {
          projectName: 'test-app',
          runtime: 'deno',
          includeExample: false,
        };

        await scaffold(tempDir, options);

        const tsconfigPath = path.join(tempDir, 'test-app', 'tsconfig.json');
        const content = await fs.readFile(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(content);
        expect(tsconfig.compilerOptions.types).toEqual([]);
      });
    });
  });
});

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
