# Phase 1: HTTP Transport + Buffered Read + Session Nonce

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Date:** 2026-04-10

## Changes

- `native/vtz/src/server/binary_fs.rs` (new)
- `native/vtz/src/server/mod.rs` (modified)
- `native/vtz/src/server/module_server.rs` (modified)
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/src/ipc_permissions.rs` (new)
- `native/vtz/src/webview/ipc_permissions.rs` (modified)
- `native/vtz/src/lib.rs` (modified)
- `native/vtz/src/config.rs` (modified)
- `native/vtz/src/main.rs` (modified)
- `native/vtz/src/webview/mod.rs` (modified)
- `native/vtz/Cargo.toml` (modified)
- `packages/desktop/src/internal/binary-fetch.ts` (new)
- `packages/desktop/src/fs.ts` (modified)
- `packages/desktop/src/ipc.ts` (modified)
- `packages/desktop/src/permissions.ts` (modified)
- `packages/desktop/src/__tests__/fs.test-d.ts` (modified)
- `packages/desktop/src/__tests__/permissions.test-d.ts` (modified)

## CI Status

- [ ] Quality gates passed (not yet verified by reviewer)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (see findings)
- [ ] No type gaps or missing edge cases (see findings)
- [x] No security issues with current threat model (see notes)
- [ ] Public API matches design doc (deviations found)

## Findings

### Blocker

#### B1: `readBinaryFile` return type deviates from design doc (`ArrayBuffer` vs `Uint8Array`)

**File:** `packages/desktop/src/fs.ts`, line 104

The design doc specifies `readBinaryFile` returns `Promise<Result<Uint8Array, DesktopError>>`. The implementation returns `Promise<Result<ArrayBuffer, DesktopError>>`:

```ts
// Current implementation:
export async function readBinaryFile(
  path: string,
): Promise<Result<ArrayBuffer, DesktopError>> {
  const result = await binaryFetch('read', path);
  if (!result.ok) return result;
  return ok(await result.value.arrayBuffer());
}
```

The design doc (lines 78-82 and 246-251) clearly specifies `Uint8Array`:
```ts
function readBinaryFile(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<Uint8Array, DesktopError>>;
```

`Uint8Array` is the more ergonomic type: it has `.byteLength`, index access, `slice()`, and is directly passable to `writeBinaryFile()`. `ArrayBuffer` is a raw container that requires wrapping before most uses. The type test at `fs.test-d.ts:112` also checks for `ArrayBuffer`, so it confirms the wrong type.

**Fix:** Wrap the result: `return ok(new Uint8Array(await result.value.arrayBuffer()));` and update the return type to `Promise<Result<Uint8Array, DesktopError>>`. Update the type test accordingly.

#### B2: `readBinaryFile` and `writeBinaryFile` missing `options?: IpcCallOptions` parameter

**File:** `packages/desktop/src/fs.ts`, lines 102-108 and 115-123

The design doc specifies both functions accept an `options?: IpcCallOptions` parameter (for timeout support). The `binaryFetch` helper in the design doc also accepts `options?: IpcCallOptions`. Neither the public functions nor `binaryFetch` accept this parameter in the implementation.

Current signatures:
```ts
export async function readBinaryFile(path: string): Promise<...>
export async function writeBinaryFile(path: string, data: ArrayBuffer | Uint8Array): Promise<...>
```

Design doc signatures:
```ts
function readBinaryFile(path: string, options?: IpcCallOptions): Promise<...>
function writeBinaryFile(path: string, data: Uint8Array, options?: IpcCallOptions): Promise<...>
```

**Fix:** Add `options?: IpcCallOptions` to both functions and thread it through to `binaryFetch`.

#### B3: `binaryFetch` missing timeout/abort handling specified in design doc

**File:** `packages/desktop/src/internal/binary-fetch.ts`

The design doc (lines 205-242) specifies `binaryFetch` should:
1. Accept `options?: IpcCallOptions`
2. Create an `AbortController`
3. Set a `setTimeout` to abort if `options.timeout` is provided
4. Map `AbortError` to `DesktopErrorCode.TIMEOUT`
5. Clean up the timeout in a `finally` block

The implementation has none of this. It also does not distinguish `AbortError` from other fetch errors -- everything is mapped to `IO_ERROR`.

**Fix:** Add the `options` parameter and implement the `AbortController`-based timeout pattern from the design doc.

#### B4: `fs.readBinaryFile` and `fs.writeBinaryFile` missing from Rust `KNOWN_METHODS` and `resolve_capability`

**File:** `native/vtz/src/ipc_permissions.rs`

The design doc (lines 150-152) states that `fs.readBinaryFile` and `fs.writeBinaryFile` must be added to `KNOWN_METHODS` and included in `resolve_capability` for `fs:read` and `fs:write` respectively. This ensures that permission resolution via `from_capabilities(&["fs:read"])` also grants `fs.readBinaryFile`.

The implementation checks `state.ipc_permissions.is_allowed("fs.readBinaryFile")` in the handler (line 127 of `binary_fs.rs`), but the string `"fs.readBinaryFile"` does not exist in `KNOWN_METHODS`, `resolve_capability("fs:read")`, or `resolve_capability("fs:all")`. This means:

- In dev mode (`AllowAll`): works fine, all methods allowed.
- In production with `fs:read` capability: `is_allowed("fs.readBinaryFile")` returns **false** because `fs:read` resolves to `["fs.readTextFile", "fs.exists", "fs.stat", "fs.readDir"]` -- binary read is not included. Users will get a 403 even with proper permissions.
- With individual method `"fs.readBinaryFile"` in capabilities: also returns **false** because it's not in `KNOWN_METHODS`, so `from_capabilities` silently ignores it.

This is a production-breaking permission bug.

**Fix:** Add `"fs.readBinaryFile"` and `"fs.writeBinaryFile"` to `KNOWN_METHODS`. Add `"fs.readBinaryFile"` to `resolve_capability("fs:read")` and `resolve_capability("fs:all")`. Add `"fs.writeBinaryFile"` to `resolve_capability("fs:write")` and `resolve_capability("fs:all")`. Update `suggest_capability` too. Update the structural invariant test `fs_all_equals_fs_read_plus_fs_write`.

#### B5: `writeBinaryFile` TypeScript function defined but no Rust handler exists

**File:** `packages/desktop/src/fs.ts`, lines 115-123

`writeBinaryFile` is fully implemented in TypeScript and will attempt `POST /__vertz_fs_binary/write?path=...`, but the Rust write handler does not exist yet (Phase 2). The route is not registered in `http.rs`. This means calling `writeBinaryFile` will hit the `dev_server_handler` fallback and return an HTML 404 page, which the JSON parsing in `binaryFetch` will fail on (resulting in a confusing `IO_ERROR` with a garbled message).

This is a trap for developers who see `writeBinaryFile` in their IDE autocomplete and try to use it before Phase 2 is merged.

**Fix:** Either:
- (a) Remove `writeBinaryFile` from `fs.ts` until Phase 2 (cleaner -- ship what works), or
- (b) Keep it but add a clear guard that returns a descriptive error:
  ```ts
  return err({
    code: 'METHOD_NOT_FOUND' as DesktopErrorCode,
    message: 'writeBinaryFile is not yet implemented. Coming in the next release.',
  });
  ```

Option (a) is preferred since Phase 2 is the next task and will add it properly.

### Should-fix

#### S1: `expand_tilde` is duplicated between `binary_fs.rs` and `webview/ipc_handlers/fs.rs`

**Files:** `native/vtz/src/server/binary_fs.rs:19` and `native/vtz/src/webview/ipc_handlers/fs.rs:12`

The function is copy-pasted with identical logic. The Phase 1 plan (line 87) actually says "reuse `expand_tilde` from `crate::webview::ipc_handlers::fs` -- make it `pub` if not already." The existing function is already `pub`. The `binary_fs.rs` version should import from `crate::webview::ipc_handlers::fs::expand_tilde` instead of duplicating.

However, since the `webview` module is behind `#[cfg(feature = "desktop")]` (see `lib.rs:23-24`), importing it from non-desktop builds would fail. The better approach is to move `expand_tilde` to a shared utility module or to `crate::ipc_permissions` (which was already moved to a shared location for similar reasons).

**Fix:** Extract `expand_tilde` to a shared module (e.g., `crate::utils::expand_tilde` or into `binary_fs.rs` as the canonical location) and have `webview/ipc_handlers/fs.rs` import it. Or simply keep the duplication but add a comment explaining why (feature gate constraint).

#### S2: `writeBinaryFile` accepts `ArrayBuffer | Uint8Array` but design doc specifies only `Uint8Array`

**File:** `packages/desktop/src/fs.ts`, line 117

The design doc signature is:
```ts
function writeBinaryFile(path: string, data: Uint8Array, options?: IpcCallOptions): Promise<...>
```

The implementation accepts `ArrayBuffer | Uint8Array`. While more permissive is generally fine, it's an undocumented deviation. If keeping `ArrayBuffer | Uint8Array`, the type test should cover the `ArrayBuffer` case too (which it does), and the design doc should be updated.

This is lower priority since `writeBinaryFile` should arguably be removed entirely per B5.

#### S3: `binaryFetch` error handling does not check `content-type` header before parsing JSON

**File:** `packages/desktop/src/internal/binary-fetch.ts`, lines 39-47

The design doc (lines 218-228) specifies checking `content-type` includes `application/json` before attempting JSON parse, with a fallback to `response.text()` for non-JSON errors (proxy errors, server crashes, etc.).

The implementation always attempts `response.json()` and catches failure with `.catch(() => null)`. This works functionally but:
1. For large non-JSON error bodies (e.g., an HTML error page from a reverse proxy), it reads the entire body before failing.
2. The fallback message `Binary file ${operation} failed with status ${response.status}` loses the actual error text.

**Fix:** Check `response.headers.get('content-type')?.includes('application/json')` before parsing, and fall back to `response.text()` for non-JSON errors, matching the design doc.

#### S4: Nonce comparison is not constant-time

**File:** `native/vtz/src/server/binary_fs.rs`, line 56

```rust
Some(value) if value.as_bytes() == nonce.as_bytes() => Ok(()),
```

This is a byte-by-byte comparison that short-circuits on first mismatch, which is theoretically vulnerable to timing side-channel attacks. An attacker on the same machine could measure response times to progressively guess nonce bytes.

In practice, this is low risk because:
- The nonce is only accessible over localhost
- An attacker on localhost already has significant access
- Network jitter dominates timing differences

However, it's best practice to use constant-time comparison for security tokens. Rust's `subtle` crate provides `ConstantTimeEq`, or a simple fixed-time loop would suffice.

**Fix:** Use `subtle::ConstantTimeEq` or implement a constant-time comparison. If this is intentionally deferred, add a `// NOTE:` comment explaining the rationale.

#### S5: No test for permission denial on `handle_binary_read`

**File:** `native/vtz/src/server/binary_fs.rs`

The handler checks `state.ipc_permissions.is_allowed("fs.readBinaryFile")` at line 127, but there's no test where `IpcPermissions` is `Restricted` with the binary read method excluded. All test helpers use `IpcPermissions::allow_all()`.

**Fix:** Add a test with `IpcPermissions::from_capabilities(&["shell:all".to_string()])` (or similar restricted set that excludes fs.readBinaryFile) and verify the handler returns 403.

Note: This test would currently not behave correctly anyway due to B4 -- even if `fs:read` is in capabilities, `fs.readBinaryFile` isn't in `resolve_capability`. Fix B4 first, then add this test.

### Nit

#### N1: `generate_nonce` uses manual hex formatting instead of `hex` crate

**File:** `native/vtz/src/server/binary_fs.rs`, line 36

```rust
bytes.iter().map(|b| format!("{:02x}", b)).collect()
```

This allocates 32 intermediate `String`s. Using `hex::encode(&bytes)` would be a single allocation. The `hex` crate is lightweight. Alternatively, a pre-allocated buffer with manual formatting would work.

Not a correctness issue, purely performance nit for a once-per-startup operation.

#### N2: `binaryFetch` is in `internal/binary-fetch.ts` but plan said to put it in `ipc.ts`

The Phase 1 plan (Task 3, step 1) says "In `ipc.ts`, add the global `__vtz_ipc_token` declaration and `binaryFetch()` helper." The implementation splits them: the global declaration is in `ipc.ts`, but `binaryFetch` is in a new `internal/binary-fetch.ts` file.

This is actually a better design (separation of concerns, internal directory signals non-public), so no change needed -- just noting the deviation.

#### N3: `body.buffer.slice(...)` in `binaryFetch` may copy unnecessarily

**File:** `packages/desktop/src/internal/binary-fetch.ts`, line 35

```ts
body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
```

When `body` is a `Uint8Array` that already covers the entire underlying `ArrayBuffer` (the common case), this creates an unnecessary copy. Consider:

```ts
const arrayBuffer = body.byteOffset === 0 && body.byteLength === body.buffer.byteLength
  ? body.buffer
  : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
```

Or simply pass `body` directly to `fetch` -- the Fetch API accepts `Uint8Array` as a body.

#### N4: Nonce injection script in `webview/mod.rs` uses string escaping instead of JSON serialization

**File:** `native/vtz/src/webview/mod.rs`, lines 129-132

```rust
let nonce_script = format!(
    "window.__vtz_ipc_token = '{}';",
    nonce.replace('\\', "\\\\").replace('\'', "\\'")
);
```

Since the nonce is hex-only (0-9, a-f), the escaping is unnecessary but harmless. A comment noting "nonce is hex-only, escaping is defense-in-depth" would clarify intent.

## Summary

**5 blockers, 5 should-fix, 4 nits.**

The most critical issues are:
1. **B4** -- Production permission bug: `fs.readBinaryFile` is checked but never added to the permission resolution system. Users with `fs:read` capability will get 403 errors.
2. **B1, B2, B3** -- API deviates from design doc in three ways: wrong return type (`ArrayBuffer` vs `Uint8Array`), missing `options` parameter, missing timeout/abort handling.
3. **B5** -- `writeBinaryFile` is exported but will produce confusing errors since the Rust handler doesn't exist yet.

The Rust handler implementation is solid: good error handling, proper use of `tokio::fs`, good test coverage of the handler itself, clean code structure. The `IpcPermissions` module move is well-executed with backward-compatible re-export.

## Resolution

Changes requested. Fix all 5 blockers before merging.
