import { readFile } from 'node:fs/promises';
import { transform, type Plugin } from 'esbuild';
import { compile } from './native-compiler';

export interface VertzLibraryPluginOptions {
  filter?: RegExp;
  target?: 'dom' | 'tui';
  exclude?: RegExp;
}

export function createVertzLibraryPlugin(options?: VertzLibraryPluginOptions): Plugin {
  const filter = options?.filter ?? /\.tsx$/;

  return {
    name: 'vertz-library-plugin',
    setup(build) {
      build.onLoad({ filter, namespace: 'file' }, async (args) => {
        const source = await readFile(args.path, 'utf-8');

        if (options?.exclude?.test(args.path)) {
          const { code } = await transform(source, {
            loader: 'tsx',
            jsx: 'automatic',
            jsxImportSource: '@vertz/ui',
          });
          return { contents: code, loader: 'js' as const };
        }

        const result = compile(source, {
          filename: args.path,
          target: options?.target,
          hydrationMarkers: true,
        });

        let contents = result.code;
        if (result.map) {
          const mapBase64 = Buffer.from(result.map).toString('base64');
          contents += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        }

        return { contents, loader: 'js' as const };
      });
    },
  };
}
