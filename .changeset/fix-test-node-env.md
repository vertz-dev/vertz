---
'@vertz/runtime': patch
---

fix(vtz): default NODE_ENV=test when unset under `vtz test`

Bun and vitest both set `NODE_ENV=test` automatically when running tests. `vtz test` didn't, so library code that distinguishes production from test (e.g. `@vertz/server`'s JWT issuer/key-pair validation) would take the production branch under `vtz ci test` in CI, where the env is bare. This caused @vertz/server auth tests to fail with:

    JWT issuer is required in production.
    Key pair is required in production.

Fixed by setting `NODE_ENV=test` at the start of `run_tests()` when NODE_ENV is unset or empty. An explicit `NODE_ENV=production` is preserved. Matches bun/vitest.
