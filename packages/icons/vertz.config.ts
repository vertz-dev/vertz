export default {
  test: {
    preload: ['./happydom.ts'],
    coveragePathIgnorePatterns: ['**/__tests__/**', '**/generated-*.ts', '**/scripts/**'],
  },
};
