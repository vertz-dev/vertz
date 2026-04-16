export default {
  test: {
    preload: ['./happydom.ts', './test-compiler-plugin.ts'],
    // build-pipeline.test.ts writes temp files and runs the full docs build
    // per test. Locally ~5s; 3× slower on linux-x64 CI exceeds the default 15s.
    timeout: 60_000,
  },
};
