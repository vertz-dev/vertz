import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { VertzConfig } from '@vertz/compiler';

const CONFIG_FILES = ['vertz.config.ts', 'vertz.config.js', 'vertz.config.mjs'];

export function findConfigFile(startDir?: string): string | undefined {
  const dir = resolve(startDir ?? process.cwd());
  for (const filename of CONFIG_FILES) {
    const filepath = join(dir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return undefined;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

const defaultConfig: VertzConfig = {
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    entryFile: 'src/app.ts',
    outputDir: '.vertz/generated',
  },
};

export async function loadConfig(configPath?: string): Promise<VertzConfig> {
  if (!configPath) {
    return { ...defaultConfig };
  }

  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  });

  const loaded = (await jiti.import(configPath)) as { default?: VertzConfig } | VertzConfig;

  const userConfig =
    loaded && typeof loaded === 'object' && 'default' in loaded
      ? (loaded.default ?? {})
      : (loaded ?? {});

  return deepMerge(
    defaultConfig as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>,
  ) as unknown as VertzConfig;
}
