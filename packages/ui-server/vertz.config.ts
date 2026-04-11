export default {
  test: {
    preload: ['./src/__tests__/preload-mock-native-compiler.ts'],
    timeout: 15000,
    coveragePathIgnorePatterns: [
      '**/core/dist/**',
      '**/errors/dist/**',
      '**/server/dist/**',
      '**/ui/dist/**',
      '**/ui/src/**',
      '**/__tests__/**',
    ],
  },
};
