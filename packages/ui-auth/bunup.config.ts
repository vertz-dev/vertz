/**
 * Note: This inlines the library plugin instead of importing from @vertz/ui-server
 * to avoid a cyclic dependency (ui-auth <-> ui-server).
 */
import { readFile } from 'node:fs/promises';
import type { BunPlugin } from 'bun';
import { defineConfig } from 'bunup';

function loadCompiler() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binaryName = `vertz-compiler.${platform}-${arch}.node`;
  const modulePath = require.resolve(`@vertz/native-compiler/${binaryName}`);
  return require(modulePath);
}

function createVertzLibraryPlugin(): BunPlugin {
  const compiler = loadCompiler();
  return {
    name: 'vertz-library-plugin',
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const source = await readFile(args.path, 'utf-8');
        const result = compiler.compile(source, {
          filename: args.path,
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

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: [
    '@vertz/icons',
    '@vertz/ui',
    '@vertz/ui/internals',
    '@vertz/ui/auth',
    '@vertz/ui/router',
    '@vertz/ui/jsx-runtime',
  ],
});
