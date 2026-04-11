export default {
  test: {
    preload: ['./test-preload.ts'],
    timeout: 120000,
    coveragePathIgnorePatterns: ['**/__tests__/**'],
  },
};
