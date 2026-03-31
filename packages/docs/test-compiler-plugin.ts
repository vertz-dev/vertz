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
