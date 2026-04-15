/**
 * Bun preload plugin that compiles .tsx files through the Vertz compiler
 * at test time. Skipped under vtz runtime — the native compiler handles
 * .tsx transforms.
 */

if (!('__vtz_runtime' in globalThis)) {
  const { compile } = await import('@vertz/ui-server');
  const { plugin } = await import('bun');

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
}
