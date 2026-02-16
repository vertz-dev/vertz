import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CONFIG_FILES = ['vertz.config.ts', 'vertz.config.js', 'vertz.config.mjs'];
export function findConfigFile(startDir) {
  const dir = resolve(startDir ?? process.cwd());
  for (const filename of CONFIG_FILES) {
    const filepath = join(dir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return undefined;
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
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
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}
const defaultConfig = {
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    entryFile: 'src/app.ts',
    outputDir: '.vertz/generated',
  },
};
export async function loadConfig(configPath) {
  if (!configPath) {
    return { ...defaultConfig };
  }
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  });
  const loaded = await jiti.import(configPath);
  const userConfig =
    loaded && typeof loaded === 'object' && 'default' in loaded
      ? (loaded.default ?? {})
      : (loaded ?? {});
  return deepMerge(defaultConfig, userConfig);
}
//# sourceMappingURL=loader.js.map
