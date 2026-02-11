import type { Plugin } from 'vite';
import { compile } from './compiler';

export interface PluginOptions {
  /** File extensions to transform. Defaults to ['.tsx']. */
  extensions?: string[];
}

/**
 * Vite plugin that transforms .tsx files using the @vertz/ui compiler.
 */
export default function vertzUiPlugin(options?: PluginOptions): Plugin {
  const extensions = options?.extensions ?? ['.tsx'];

  return {
    name: 'vertz-ui-compiler',

    transform(code: string, id: string) {
      const matchesExtension = extensions.some((ext) => id.endsWith(ext));
      if (!matchesExtension) {
        return undefined;
      }

      const result = compile(code, id);

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}
