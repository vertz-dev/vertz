// index.ts
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
var require2 = createRequire(import.meta.url);
function getBinaryPath() {
  const pkg = `@vertz/runtime-${process.platform}-${process.arch}`;
  let pkgDir;
  try {
    pkgDir = dirname(require2.resolve(`${pkg}/package.json`));
  } catch {
    throw new Error(`No Vertz runtime binary available for ${process.platform}-${process.arch}.
` + `Expected package: ${pkg}

` + `If your platform is supported, try: npm install @vertz/runtime
` + `If your platform is not supported, build from source: cd native && cargo build --release

` + `Supported platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64
` + `See: https://vertz.dev/docs/runtime`);
  }
  const binaryPath = join(pkgDir, "vertz-runtime");
  if (!existsSync(binaryPath)) {
    throw new Error(`Vertz runtime package ${pkg} is installed but the binary is missing at ${binaryPath}.
` + `The package may be corrupted or incompletely installed.

` + `Try: npm rebuild ${pkg}`);
  }
  return binaryPath;
}
export {
  getBinaryPath
};
