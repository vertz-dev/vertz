/**
 * Bun preload plugin that compiles .tsx files through the Vertz native compiler
 * at test time. This ensures `let` -> signal() and JSX -> __element()/__attr()
 * transforms run during `bun test`, matching the build-time behavior.
 *
 * Note: This loads the native compiler directly instead of importing from
 * @vertz/ui-server to avoid a cyclic dependency (ui-auth <-> ui-server).
 */

import { plugin } from 'bun';

function loadCompiler() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binaryName = `vertz-compiler.${platform}-${arch}.node`;
  const modulePath = require.resolve(`@vertz/native-compiler/${binaryName}`);
  return require(modulePath);
}

const compiler = loadCompiler();

plugin({
  name: 'vertz-test-compiler',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const result = compiler.compile(source, { filename: args.path, target: 'dom' });
      return { contents: result.code, loader: 'ts' };
    });
  },
});
