---
'@vertz/runtime': patch
---

fix(vtz): register preload script mocks in module loader

Preload scripts that called `mock.module()` / `vi.mock()` had their mocks silently ignored because the Rust module loader only checked mocks extracted at compile time from the test file. The runtime now bridges preload mocks to the module loader's registry after each preload evaluates.
