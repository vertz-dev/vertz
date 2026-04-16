export default {
  test: {
    preload: ['../../test-preload.ts'],
    // PGlite-backed CLI tests (migrate-dev, status, request-scope) spin up a
    // WASM Postgres per test. On linux-x64 CI each test is 2–3× slower than
    // local macOS/arm64, pushing files of 20+ tests past the default 15s.
    timeout: 60_000,
    coveragePathIgnorePatterns: [
      '**/errors/dist/**',
      '**/schema/dist/**',
      '**/schema/src/**',
      '**/__tests__/**',
    ],
  },
};
