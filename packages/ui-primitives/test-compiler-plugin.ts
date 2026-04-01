/**
 * Bun preload plugin that compiles .tsx files through the Vertz compiler
 * at test time. This ensures `let` → signal() and JSX → __element()/__attr()
 * transforms run during `bun test`, matching the build-time behavior.
 */

import { compile } from '@vertz/ui-server';
import { plugin } from 'bun';

plugin({
  name: 'vertz-test-compiler',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const result = compile(source, { filename: args.path, target: 'dom' });
      return { contents: result.code, loader: 'ts' };
    });
  },
});
