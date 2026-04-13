# @vertz/desktop

## 0.2.59

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.60

## 0.2.58

### Patch Changes

- [#2505](https://github.com/vertz-dev/vertz/pull/2505) [`44fe439`](https://github.com/vertz-dev/vertz/commit/44fe43908fa9b72e7ce7b8155f962fb626155378) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add Windows platform handling for `app.dataDir()` and `app.cacheDir()` using `APPDATA` and `LOCALAPPDATA` environment variables. Error messages now include the specific missing environment variable name.

- Updated dependencies []:
  - @vertz/errors@0.2.59

## 0.2.57

### Patch Changes

- [#2488](https://github.com/vertz-dev/vertz/pull/2488) [`1406000`](https://github.com/vertz-dev/vertz/commit/14060004c364ab1865d6917356def18317abd549) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(desktop): add binary file read/write APIs with HTTP transport (#2407)

  - `fs.readBinaryFile()` / `fs.writeBinaryFile()` — buffered binary I/O via HTTP sidecar (2 GiB limit)
  - `fs.readBinaryStream()` / `fs.writeBinaryStream()` — streaming binary I/O with no size limit
  - Atomic writes via temp file + rename for crash safety
  - Session nonce authentication on all binary routes
  - IPC permission enforcement (`fs:read`, `fs:write`)

- Updated dependencies []:
  - @vertz/errors@0.2.58

## 0.2.56

### Patch Changes

- [#2469](https://github.com/vertz-dev/vertz/pull/2469) [`31e1ac8`](https://github.com/vertz-dev/vertz/commit/31e1ac8cbfbff804f6f33afb918571bad7193a92) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add TypeScript types for the desktop IPC permission system: `IpcCapabilityGroup`, `IpcMethodString`, `IpcPermission`, and `DesktopPermissionConfig`.

- [#2461](https://github.com/vertz-dev/vertz/pull/2461) [`5fdfb25`](https://github.com/vertz-dev/vertz/commit/5fdfb2560a769ee7d71004018cc26288564a9799) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(desktop): `fs.remove()` now removes non-empty directories recursively

- Updated dependencies []:
  - @vertz/errors@0.2.57

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.56

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.55

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.54

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.53
