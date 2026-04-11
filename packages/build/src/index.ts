export type {
  BuildConfig,
  OutputFileInfo,
  PostBuildContext,
  PostBuildHook,
} from './types';

export { build } from './build';

export function defineConfig(config: import('./types').BuildConfig): import('./types').BuildConfig;
export function defineConfig(
  config: import('./types').BuildConfig[],
): import('./types').BuildConfig[];
export function defineConfig(
  config: import('./types').BuildConfig | import('./types').BuildConfig[],
): import('./types').BuildConfig | import('./types').BuildConfig[] {
  return config;
}
