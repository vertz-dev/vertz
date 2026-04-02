import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface OpenAPIConfig {
  source: string;
  output: string;
  baseURL: string;
  groupBy: 'tag' | 'path' | 'none';
  schemas: boolean;
  operationIds?: {
    overrides?: Record<string, string>;
    transform?: (cleaned: string, original: string) => string;
  };
}

const DEFAULTS: Omit<OpenAPIConfig, 'source'> = {
  output: './src/generated',
  baseURL: '',
  groupBy: 'tag',
  schemas: false,
};

/**
 * Merge CLI flags with config file values. CLI flags take precedence.
 */
export function resolveConfig(
  cliFlags: Partial<OpenAPIConfig> & { from?: string },
  configFile?: Partial<OpenAPIConfig>,
): OpenAPIConfig {
  const source = cliFlags.from ?? cliFlags.source ?? configFile?.source;
  if (!source) {
    throw new Error(
      'Missing required "source" — provide --from <path> or set source in openapi.config.ts',
    );
  }

  return {
    source,
    output: cliFlags.output ?? configFile?.output ?? DEFAULTS.output,
    baseURL: cliFlags.baseURL ?? configFile?.baseURL ?? DEFAULTS.baseURL,
    groupBy: cliFlags.groupBy ?? configFile?.groupBy ?? DEFAULTS.groupBy,
    schemas: cliFlags.schemas ?? configFile?.schemas ?? DEFAULTS.schemas,
    operationIds: cliFlags.operationIds ?? configFile?.operationIds,
  };
}

/**
 * Load config from openapi.config.ts if it exists.
 */
export async function loadConfigFile(
  cwd: string,
): Promise<Partial<OpenAPIConfig> | undefined> {
  const configPath = join(cwd, 'openapi.config.ts');
  if (!existsSync(configPath)) return undefined;

  const mod = await import(configPath);
  return mod.default ?? mod;
}

/**
 * Type helper for config files.
 */
export function defineConfig(config: Partial<OpenAPIConfig>): Partial<OpenAPIConfig> {
  return config;
}
