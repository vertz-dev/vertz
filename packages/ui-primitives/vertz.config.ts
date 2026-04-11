export default {
  test: {
    preload: ['../../test-preload.ts', './happydom.ts', './test-compiler-plugin.ts'],
    coveragePathIgnorePatterns: ['**/ui/dist/**', '**/__tests__/**'],
  },
};
