import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CodegenIR } from '../../types';
import { RouterAugmentationGenerator } from '../router-augmentation-generator';

const execFileAsync = promisify(execFile);
const isVtzRuntime = '__vtz_runtime' in globalThis;
const require = createRequire(import.meta.url);
const tscBin = isVtzRuntime ? '' : require.resolve('typescript/bin/tsc');

function createEmptyIR(): CodegenIR {
  return {
    auth: { schemes: [], operations: [] },
    basePath: '/api',
    entities: [],
    modules: [],
    schemas: [],
  };
}

describe('RouterAugmentationGenerator', () => {
  const generator = new RouterAugmentationGenerator();
  let projectRoot = '';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'vertz-router-augmentation-'));
    await writeFile(join(projectRoot, 'package.json'), '{ "name": "test-app" }\n', 'utf-8');
  });

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it('generates router.d.ts for src/router.ts', async () => {
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(
      join(projectRoot, 'src', 'router.ts'),
      [
        "import { defineRoutes } from '@vertz/ui';",
        '',
        'export const routes = defineRoutes({',
        "  '/': { component: () => document.createElement('div') },",
        '});',
        '',
      ].join('\n'),
      'utf-8',
    );

    const files = await generator.generate(createEmptyIR(), {
      options: {},
      outputDir: join(projectRoot, '.vertz', 'generated'),
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('router.d.ts');
    expect(files[0]?.content).toContain("import type { routes } from '../../src/router';");
    expect(files[0]?.content).toContain("declare module '@vertz/ui' {");
    expect(files[0]?.content).toContain("declare module '@vertz/ui/router' {");
    expect(files[0]?.content).toContain(
      'export function useRouter(): UnwrapSignals<TypedRouter<AppRouteMap>>;',
    );
  });

  it('uses src/ui/router.ts when present', async () => {
    await mkdir(join(projectRoot, 'src', 'ui'), { recursive: true });
    await writeFile(
      join(projectRoot, 'src', 'ui', 'router.ts'),
      [
        "import { defineRoutes } from '@vertz/ui';",
        '',
        'export const routes = defineRoutes({',
        "  '/settings': { component: () => document.createElement('div') },",
        '});',
        '',
      ].join('\n'),
      'utf-8',
    );

    const files = await generator.generate(createEmptyIR(), {
      options: {},
      outputDir: join(projectRoot, '.vertz', 'generated'),
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.content).toContain("import type { routes } from '../../src/ui/router';");
  });

  it('accepts candidate route files that export routes via a helper', async () => {
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(
      join(projectRoot, 'src', 'router.ts'),
      [
        "import { defineRoutes } from '@vertz/ui';",
        '',
        'function buildRoutes() {',
        '  return defineRoutes({',
        "    '/': { component: () => document.createElement('div') },",
        '  });',
        '}',
        '',
        'export const routes = buildRoutes();',
        '',
      ].join('\n'),
      'utf-8',
    );

    const files = await generator.generate(createEmptyIR(), {
      options: {},
      outputDir: join(projectRoot, '.vertz', 'generated'),
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.content).toContain("import type { routes } from '../../src/router';");
  });

  it('falls back to scanning src for an exported routes defineRoutes call', async () => {
    await mkdir(join(projectRoot, 'src', 'features'), { recursive: true });
    await writeFile(
      join(projectRoot, 'src', 'features', 'app-routes.tsx'),
      [
        "import { defineRoutes } from '@vertz/ui';",
        '',
        'const routes = defineRoutes({',
        "  '/tasks/:id': { component: () => document.createElement('div') },",
        '});',
        '',
        'export { routes };',
        '',
      ].join('\n'),
      'utf-8',
    );

    const files = await generator.generate(createEmptyIR(), {
      options: {},
      outputDir: join(projectRoot, '.vertz', 'generated'),
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.content).toContain(
      "import type { routes } from '../../src/features/app-routes';",
    );
  });

  it('returns no files when the project has no exported route map', async () => {
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(
      join(projectRoot, 'src', 'router.ts'),
      [
        "import { defineRoutes } from '@vertz/ui';",
        '',
        'const localRoutes = defineRoutes({',
        "  '/': { component: () => document.createElement('div') },",
        '});',
        '',
        'void localRoutes;',
        '',
      ].join('\n'),
      'utf-8',
    );

    const files = await generator.generate(createEmptyIR(), {
      options: {},
      outputDir: join(projectRoot, '.vertz', 'generated'),
    });

    expect(files).toEqual([]);
  });

  // vtz runtime lacks process.execPath and createRequire deep subpath resolution needed to spawn tsc
  it.skipIf(isVtzRuntime)(
    'type-checks generated augmentation so useRouter() rejects invalid routes',
    async () => {
      await mkdir(join(projectRoot, 'src'), { recursive: true });
      await writeFile(
        join(projectRoot, 'ui.d.ts'),
        [
          "declare module '@vertz/ui' {",
          '  export type RouteConfigLike = { component: () => Node };',
          '  export type TypedRoutes<T extends Record<string, RouteConfigLike>> = { readonly __routes: T };',
          '  export type InferRouteMap<T> = T extends TypedRoutes<infer R> ? R : T;',
          '  export type PathWithParams<T extends string> = T extends `${infer Before}*`',
          '    ? `${PathWithParams<Before>}${string}`',
          '    : T extends `${infer Before}:${string}/${infer After}`',
          '      ? `${Before}${string}/${PathWithParams<`${After}`>}`',
          '      : T extends `${infer Before}:${string}`',
          '        ? `${Before}${string}`',
          '        : T;',
          '  export type RoutePaths<TRouteMap extends Record<string, unknown>> = {',
          '    [K in keyof TRouteMap & string]: PathWithParams<K>;',
          '  }[keyof TRouteMap & string];',
          '  export type RoutePattern<TRouteMap extends Record<string, unknown>> = keyof TRouteMap & string;',
          '  export type ExtractSearchParams<TPath extends string, TMap extends Record<string, RouteConfigLike> = Record<string, RouteConfigLike>> = Record<string, string>;',
          '  export interface ReactiveSearchParams<T = Record<string, unknown>> {',
          '    navigate(partial: Partial<T>, options?: { push?: boolean }): void;',
          '    [key: string]: unknown;',
          '  }',
          '  export interface TypedRouter<T extends Record<string, RouteConfigLike>> {',
          '    navigate(url: RoutePaths<T>): void;',
          '  }',
          '  export type UnwrapSignals<T> = T;',
          '  export function defineRoutes<const T extends Record<string, RouteConfigLike>>(map: T): TypedRoutes<T>;',
          '  export function useRouter<T extends Record<string, RouteConfigLike> = Record<string, RouteConfigLike>>(): UnwrapSignals<TypedRouter<T>>;',
          '  export function useSearchParams<TPath extends string>(): ReactiveSearchParams<ExtractSearchParams<TPath>>;',
          '}',
          "declare module '@vertz/ui/router' {",
          "  export { useRouter, useSearchParams } from '@vertz/ui';",
          '}',
          '',
        ].join('\n'),
        'utf-8',
      );
      await writeFile(
        join(projectRoot, 'src', 'router.ts'),
        [
          "import { defineRoutes } from '@vertz/ui';",
          '',
          'export const routes = defineRoutes({',
          "  '/': { component: () => document.createElement('div') },",
          "  '/tasks/:id': { component: () => document.createElement('div') },",
          '});',
          '',
        ].join('\n'),
        'utf-8',
      );
      await writeFile(
        join(projectRoot, 'src', 'page.ts'),
        [
          "import { useRouter } from '@vertz/ui';",
          '',
          'const router = useRouter();',
          "router.navigate('/');",
          "router.navigate('/tasks/new');",
          '',
          '// @ts-expect-error invalid route should be rejected by generated augmentation',
          "router.navigate('/bad');",
          '',
        ].join('\n'),
        'utf-8',
      );

      const files = await generator.generate(createEmptyIR(), {
        options: {},
        outputDir: join(projectRoot, '.vertz', 'generated'),
      });

      expect(files).toHaveLength(1);
      const generatedRouter = files[0];
      expect(generatedRouter).toBeDefined();
      if (!generatedRouter) {
        throw new Error('Expected router augmentation file to be generated');
      }
      await mkdir(join(projectRoot, '.vertz', 'generated'), { recursive: true });
      await writeFile(
        join(projectRoot, '.vertz', 'generated', 'router.d.ts'),
        generatedRouter.content,
      );
      await writeFile(
        join(projectRoot, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              module: 'ESNext',
              moduleResolution: 'bundler',
              noEmit: true,
              strict: true,
            },
            files: ['ui.d.ts', 'src/router.ts', 'src/page.ts', '.vertz/generated/router.d.ts'],
          },
          null,
          2,
        ),
      );
      await expect(
        execFileAsync(process.execPath, [tscBin, '-p', 'tsconfig.json'], { cwd: projectRoot }),
      ).resolves.toMatchObject({
        stderr: '',
      });
    },
    15_000,
  );
});
