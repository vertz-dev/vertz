try {
  // Dynamic import not available in CJS postinstall context — use require on the compiled .js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getBinaryPath } = require('./index.js');
  getBinaryPath();
} catch {
  const pkg = `@vertz/runtime-${process.platform}-${process.arch}`;
  console.warn(
    `\x1b[33m[vertz]\x1b[0m Runtime binary not found for ${process.platform}-${process.arch}. ` +
      `\`vertz dev\` will fall back to Bun.\n` +
      `Try: npm install ${pkg}`,
  );
}
