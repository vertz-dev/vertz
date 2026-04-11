export default {
  test: {
    preload: ['../../test-preload.ts'],
    coveragePathIgnorePatterns: [
      '**/errors/dist/**',
      '**/schema/dist/**',
      '**/schema/src/**',
      '**/__tests__/**',
    ],
  },
};
