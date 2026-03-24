import { compile } from '@vertz/ui-compiler';
import { plugin } from 'bun';

plugin({
  name: 'vertz-test-compiler',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();

      const result = compile(source, {
        filename: args.path,
        target: 'dom',
      });

      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        const messages = errors.map((d) => `${d.code}: ${d.message}`);
        throw new Error(`Vertz compilation errors:\n${messages.join('\n')}`);
      }

      return { contents: result.code, loader: 'tsx' };
    });
  },
});
