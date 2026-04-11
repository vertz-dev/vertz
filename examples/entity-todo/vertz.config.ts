/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  test: {
    preload: ['./test-setup.ts', './test-compiler-plugin.ts'],
    root: './src',
  },
};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
