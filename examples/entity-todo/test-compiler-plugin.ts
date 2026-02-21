/**
 * Bun preload plugin that runs the Vertz compiler on .tsx files.
 *
 * This ensures that compiler transforms (let → signal, JSX conditionals,
 * JSX list rendering) are applied during `bun test`, matching the
 * behaviour of the Vite plugin at dev/build time.
 */
import { compile } from '@vertz/ui-compiler';
import { plugin } from 'bun';

plugin({
  name: 'vertz-compiler',
  setup(build) {
    build.onLoad({ filter: /examples\/entity-todo\/src\/.*\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const result = compile(source, args.path);
      return { contents: result.code, loader: 'ts' };
    });
  },
});
