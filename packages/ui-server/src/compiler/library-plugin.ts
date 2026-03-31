import { readFile } from 'node:fs/promises';
import type { BunPlugin } from 'bun';
import { compile } from './native-compiler';

export interface VertzLibraryPluginOptions {
  filter?: RegExp;
  target?: 'dom' | 'tui';
  exclude?: RegExp;
}

export function createVertzLibraryPlugin(options?: VertzLibraryPluginOptions): BunPlugin {
  const filter = options?.filter ?? /\.tsx$/;

  return {
    name: 'vertz-library-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await readFile(args.path, 'utf-8');

        if (options?.exclude?.test(args.path)) {
          const transpiled = new Bun.Transpiler({
            loader: 'tsx',
            autoImportJSX: true,
            tsconfig: JSON.stringify({
              compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@vertz/ui' },
            }),
          }).transformSync(source);
          return { contents: transpiled, loader: 'js' as const };
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

        return { contents, loader: 'tsx' as const };
      });
    },
  };
}
