/**
 * Bun preload plugin that compiles .tsx files through the Vertz compiler
 * at test time. This ensures `let` → signal() and JSX → __element()/__attr()
 * transforms run during `bun test`, matching the build-time behavior.
 */

import { compile } from '@vertz/ui-compiler';
import { plugin } from 'bun';

plugin({
  name: 'vertz-test-compiler',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();

      // Composed primitives are framework-level code — they use JSX for
      // declarative element creation but are NOT user components. Skip
      // reactive transforms (let→signal, computed) that would break them.
      // Pass through to Bun's native JSX handling.
      if (args.path.includes('-composed.tsx')) {
        return { contents: source, loader: 'tsx' };
      }

      const result = compile(source, {
        filename: args.path,
        target: 'dom',
      });

      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        const messages = errors.map((d) => `${d.code}: ${d.message} (line ${d.line})`);
        throw new Error(`Vertz compilation errors in ${args.path}:\n${messages.join('\n')}`);
      }

      return { contents: result.code, loader: 'ts' };
    });
  },
});
