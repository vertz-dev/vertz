# @vertz/fetch

## 0.1.1

### Patch Changes

- [#489](https://github.com/vertz-dev/vertz/pull/489) [`215635f`](https://github.com/vertz-dev/vertz/commit/215635f4c8ee92826f66b964a107727ad856d81a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Added convenience methods to FetchClient: get(), post(), patch(), put(), delete().
  Removed incorrect params-to-query mapping (params are path parameters, handled by codegen at the SDK layer).
