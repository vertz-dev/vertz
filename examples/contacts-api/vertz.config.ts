/** @type {import('@vertz/compiler').VertzConfig} */
export default {};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
  outputDir: 'src/generated',
};
