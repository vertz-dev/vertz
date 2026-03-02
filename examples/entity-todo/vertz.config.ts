/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
