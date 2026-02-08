import { existsSync } from 'node:fs';
import { join, parse, resolve } from 'node:path';
import {
  type CLIConfig,
  type CompilerConfig,
  type DevConfig,
  defaultCLIConfig,
  type UserCLIConfig,
} from './defaults.js';

declare const Bun: unknown;

const CONFIG_FILE_NAMES = ['vertz.config.ts', 'vertz.config.js', 'vertz.config.mjs'] as const;

export function findConfigFile(from: string): string | null {
  let dir = resolve(from);
  const root = parse(dir).root;

  while (true) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = resolve(dir, '..');
    if (parent === dir || dir === root) {
      return null;
    }
    dir = parent;
  }
}

async function loadConfigFile(path: string): Promise<unknown> {
  if (typeof Bun !== 'undefined') {
    return import(path);
  }
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url);
  return jiti.import(path);
}

function mergeWithDefaults(userConfig: UserCLIConfig): CLIConfig {
  return {
    strict: userConfig.strict ?? defaultCLIConfig.strict,
    forceGenerate: userConfig.forceGenerate ?? defaultCLIConfig.forceGenerate,
    compiler: {
      ...defaultCLIConfig.compiler,
      ...userConfig.compiler,
    } as CompilerConfig,
    dev: {
      ...defaultCLIConfig.dev,
      ...userConfig.dev,
    } as DevConfig,
    generators: userConfig.generators ?? defaultCLIConfig.generators,
  };
}

export async function loadConfig(cwd?: string): Promise<CLIConfig> {
  const configPath = findConfigFile(cwd ?? process.cwd());
  if (!configPath) {
    return defaultCLIConfig;
  }

  const raw = await loadConfigFile(configPath);
  const userConfig = ((raw as { default?: unknown }).default ?? raw) as UserCLIConfig;
  return mergeWithDefaults(userConfig);
}
