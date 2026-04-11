/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  test: {
    root: 'src',
  },
};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
