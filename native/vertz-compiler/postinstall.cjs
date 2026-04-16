// Copies the correct platform .node binary from the platform package
// into this selector package directory so require.resolve() finds it.
const fs = require('fs');
const path = require('path');

const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const binaryName = `vertz-compiler.${platform}-${arch}.node`;
const pkgName = `@vertz/native-compiler-${platform}-${arch}`;

try {
  const pkgDir = path.dirname(require.resolve(`${pkgName}/package.json`));
  const src = path.join(pkgDir, binaryName);
  const dest = path.join(__dirname, binaryName);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
} catch {
  // Platform package not available — native compiler will fall back gracefully
}
