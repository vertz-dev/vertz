export type {
  BuildConfig,
  OutputFileInfo,
  PostBuildContext,
  PostBuildHook,
} from './types.js';

export { build } from './build.js';

export function defineConfig(config: import('./types.js').BuildConfig): import('./types.js').BuildConfig;
export function defineConfig(
  config: import('./types.js').BuildConfig[],
): import('./types.js').BuildConfig[];
export function defineConfig(
  config: import('./types.js').BuildConfig | import('./types.js').BuildConfig[],
): import('./types.js').BuildConfig | import('./types.js').BuildConfig[] {
  return config;
}
