# Phases 2-5b Consolidated Review

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** d1c6e234..bc30acef
- **Date:** 2026-03-29

## Changes

- `src/runtime/ops/crypto.rs` (modified) -- randomUUID, getRandomValues, hash digest, timing-safe equal, randomBytes
- `src/runtime/ops/crypto_subtle.rs` (new) -- SubtleCrypto: digest, importKey, exportKey, sign, verify, generateKey, encrypt, decrypt, deriveBits, deriveKey; CryptoKeyStore
- `src/runtime/ops/web_api.rs` (new) -- Event, EventTarget, AbortController, AbortSignal, DOMException, Headers, Request, Response, upgraded fetch()
- `src/runtime/ops/streams.rs` (new) -- ReadableStream, WritableStream, TransformStream, Blob, File, FormData
- `src/runtime/ops/path.rs` (modified) -- added relative, normalize, isAbsolute, parse, format ops
- `src/runtime/ops/os.rs` (new) -- tmpdir, homedir, platform, hostname + JS shim (type, arch, cpus, etc.)
- `src/runtime/ops/url.rs` (modified) -- added fileURLToPath, pathToFileURL ops
- `src/runtime/ops/fs.rs` (new) -- full sync/async FS ops + Buffer shim + node:fs JS bootstrap
- `src/runtime/module_loader.rs` (modified) -- synthetic modules for node:path, node:os, node:url, node:events, node:process, node:fs, node:fs/promises, node:crypto, node:buffer
- `tests/v8_integration.rs` (modified) -- E2E integration tests for node:path, node:os, node:events imports
- `Cargo.toml` (modified) -- added rsa, sha2, libc dependencies

## Review Checklist

- [x] Delivers what the design doc asks for
- [x] TDD compliance (tests alongside implementation)
- [ ] No type gaps or missing edge cases (see findings)
- [ ] No security issues (see findings)
- [x] Public API matches spec (mostly -- see deviations noted)

## Findings

### BLOCKERs

#### B1: AES-GCM encrypt/decrypt tries 256-bit key first, silently falls back to 128-bit

**File:** `src/runtime/ops/crypto_subtle.rs`, lines ~1048-1050 and ~1098-1100

The encrypt and decrypt ops try `AES_256_GCM` first, then fall back to `AES_128_GCM`:

```rust
let unbound_key = ring::aead::UnboundKey::new(&ring::aead::AES_256_GCM, raw)
    .or_else(|_| ring::aead::UnboundKey::new(&ring::aead::AES_128_GCM, raw))
```

This means a 16-byte (128-bit) key will first fail on AES-256, then succeed on AES-128. While the end result is functionally correct, this is error-prone and wasteful. More importantly, if a key that is 24 bytes (192 bits, not supported by ring) is passed, it will produce a confusing "Invalid AES key" error from the 128-bit attempt, not a clear "192-bit keys not supported" message. The importKey validation (line 268) correctly rejects non-16/non-32 byte keys, but if the key store is ever bypassed or if key material gets corrupted, this fallback masks the real issue.

**Fix:** Select the algorithm based on `raw.len()` explicitly:
```rust
let algo = match raw.len() {
    16 => &ring::aead::AES_128_GCM,
    32 => &ring::aead::AES_256_GCM,
    _ => return Err(anyhow!("OperationError: AES key must be 128 or 256 bits")),
};
let unbound_key = ring::aead::UnboundKey::new(algo, raw).map_err(...)?;
```

#### B2: CryptoKeyStore key IDs overflow silently at u32::MAX

**File:** `src/runtime/ops/crypto_subtle.rs`, lines 44-48

```rust
pub fn insert(&mut self, key: StoredKey) -> u32 {
    let id = self.next_id;
    self.next_id += 1;  // wraps at u32::MAX
    self.keys.insert(id, key);
    id
}
```

After `u32::MAX` insertions, `next_id` wraps to 0 and begins overwriting existing keys. While unlikely in practice, this is a correctness bug in a crypto subsystem where key identity matters. An attacker-controlled script that rapidly generates keys could trigger this.

**Fix:** Use `checked_add` and return an error, or use a `u64` counter.

#### B3: `node:fs` ops have no path traversal protection

**File:** `src/runtime/ops/fs.rs`

All FS ops (`op_fs_read_file_sync`, `op_fs_write_file_sync`, `op_fs_rm_sync`, etc.) accept arbitrary paths with no sandboxing or validation. A user script can read, write, or delete any file the process has OS-level access to, including `../../etc/passwd` or similar.

While this may be intentional for a dev-time runtime (like Bun/Deno without `--allow-read`), this needs to be a conscious, documented decision. At minimum, the runtime should either:
1. Accept and document that all FS access is unrestricted (matching Bun behavior), or
2. Implement a permission system (matching Deno behavior)

If unrestricted access is intentional, add a comment documenting this decision. If not, this is a security blocker.

**Recommendation:** Add a comment to `fs.rs` documenting that FS access is unrestricted by design (matching Bun semantics), and create an issue for a future permission system.

#### B4: `op_fs_write_file_sync` has dead code that silently skips parent directory creation

**File:** `src/runtime/ops/fs.rs`, lines 91-96

```rust
pub fn op_fs_write_file_sync(...) -> Result<(), AnyError> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.exists() && !parent.as_os_str().is_empty() {
            // Don't auto-create -- match Node behavior (ENOENT if parent missing)
        }
    }
    std::fs::write(&path, data).map_err(...)
}
```

The `if` block does nothing. This is dead code. The comment says "match Node behavior", but the actual error will come from `std::fs::write` failing, and the error message will misleadingly say "ENOENT" regardless of the actual IO error kind (it could be permission denied, etc.). **The dead code should be removed.**

### SHOULD-FIX

#### S1: `os.arch()` is hardcoded to `'arm64'`

**File:** `src/runtime/ops/os.rs`, line 84

```js
arch: () => 'arm64',
```

This returns `'arm64'` on all architectures, including x86_64 Linux CI runners. Node.js returns the actual architecture (`process.arch`). This is wrong and will cause incorrect behavior for any code that checks the architecture.

**Fix:** Add a Rust op `op_os_arch()` that returns `std::env::consts::ARCH` mapped to Node.js conventions (`x86_64` -> `x64`, `aarch64` -> `arm64`, etc.).

#### S2: `os.EOL` is hardcoded to `'\n'`, wrong on Windows

**File:** `src/runtime/ops/os.rs`, line 70

```js
const EOL = '\n';
```

Node.js `os.EOL` returns `'\r\n'` on Windows. Since the runtime targets cross-platform, this should be platform-aware.

**Fix:** Either use a Rust op or `if (Deno.core.ops.op_os_platform() === 'win32') EOL = '\r\n'`.

#### S3: `createHmac` HMAC block size for SHA-384 is wrong

**File:** `src/runtime/module_loader.rs`, line 679 (NODE_CRYPTO_MODULE)

```js
const blockSize = normalizedAlgo.includes('512') ? 128 : 64;
```

SHA-384 has a block size of 128 bytes (same as SHA-512, since SHA-384 is a truncated SHA-512). But this code checks if the algo string `includes('512')`, so SHA-384 falls through to block size 64. This produces incorrect HMAC values for SHA-384.

**Fix:** `const blockSize = (normalizedAlgo.includes('512') || normalizedAlgo.includes('384')) ? 128 : 64;`

#### S4: `ReadableStream.error()` controller resolves pending pulls with `null` instead of rejecting

**File:** `src/runtime/ops/streams.rs`, lines 87-93

```js
error: (e) => {
    this.#closed = true;
    for (const resolve of this.#pullResolvers) {
        resolve(null);  // should reject with e
    }
    this.#pullResolvers = [];
},
```

Per the Streams spec, when `controller.error(e)` is called, pending reads should reject with the error `e`, not resolve with `null` (which signals normal EOF). This means stream consumers cannot distinguish between a normal close and an error.

**Fix:** Store pending pull resolvers as `{resolve, reject}` pairs and call `reject(e)` in the error path.

#### S5: `Request` constructor doesn't copy body from input Request

**File:** `src/runtime/ops/web_api.rs`, line 345

When constructing a `Request` from another `Request` and no `init.body` is provided:

```js
this.#body = createBodyMixin(init.body !== undefined ? init.body : null);
```

If `init.body` is `undefined`, this creates an empty body (`null`), discarding the original Request's body. Per spec, the body should be taken from the input Request when `init.body` is not provided.

**Fix:**
```js
this.#body = createBodyMixin(init.body !== undefined ? init.body : input._cloneBody());
```
Or expose a way to get the body from the source Request.

#### S6: `fetch()` doesn't read body from Request object

**File:** `src/runtime/ops/web_api.rs`, lines 475-477

```js
if (init.body !== undefined) {
    options.body = init.body;
}
```

When `fetch()` is called with a `Request` object that has a body, the body is never extracted from the Request and sent to the Rust op. It only checks `init.body`, not `req.body`. A `fetch(new Request(url, { method: 'POST', body: '...' }))` call will send a POST with no body.

**Fix:** Also check for body on the Request object:
```js
if (init.body !== undefined) {
    options.body = init.body;
} else if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Read body from Request
    options.body = await req.text();
}
```

#### S7: `node:os` synthetic module `type` export uses invalid identifier workaround

**File:** `src/runtime/module_loader.rs`, lines 387-388

```js
export const type_ = os.type;
export { type_ as type };
```

While `type` is a reserved word in strict mode for some contexts, it's actually valid as an export binding in ESM. However, the intermediate `type_` variable is exported both as `type_` and as `type`, which means `import { type_ } from 'node:os'` works (which Node.js doesn't support). This is a minor API surface leak.

**Fix:** Consider only exporting as `type` (test that V8 ESM handles this correctly).

#### S8: All FS error messages hardcode `ENOENT` regardless of actual error kind

**File:** `src/runtime/ops/fs.rs`, multiple lines (e.g., 75, 82, 97)

```rust
.map_err(|e| deno_core::anyhow::anyhow!("ENOENT: {}: '{}'", e, path))
```

This prepends "ENOENT" to all errors, even permission denied (`EACCES`), disk full (`ENOSPC`), etc. Node.js uses the actual error code. Code that checks for `ENOENT` in the error message to handle "file not found" will get false positives.

**Fix:** Map `io::ErrorKind` to the appropriate POSIX error code:
```rust
fn io_error_code(e: &std::io::Error) -> &str {
    match e.kind() {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        std::io::ErrorKind::AlreadyExists => "EEXIST",
        _ => "EIO",
    }
}
```

#### S9: `node:process` shim `exit()` is a no-op

**File:** `src/runtime/module_loader.rs`, line 541

```js
if (!proc.exit) proc.exit = () => {};
```

`process.exit()` silently does nothing. Code that calls `process.exit(1)` to abort on fatal errors will continue executing, potentially causing unexpected behavior or data corruption. At minimum, this should throw an error or log a warning.

**Fix:** `proc.exit = (code) => { throw new Error('process.exit(' + code + ') called'); };`

#### S10: `crypto.subtle` methods are synchronous wrapped in `async`

**File:** `src/runtime/ops/crypto.rs`, lines 163-171 (bootstrap JS)

All `SubtleCrypto` methods (e.g., `digest`, `sign`, `verify`, `generateKey`, `encrypt`, `decrypt`) are marked `async` but call synchronous Rust ops. This means:
1. RSA key generation (line 944 in crypto_subtle.rs) blocks the event loop, which can be very slow for large key sizes (4096-bit takes seconds).
2. The Web Crypto API spec says these should be async, and callers expect them not to block.

**Recommendation:** For the MVP this is acceptable, but RSA key generation should be moved to a tokio::spawn_blocking task. Add a TODO comment.

### NITs

#### N1: `_locked` property on ReadableStream/WritableStream is public

**File:** `src/runtime/ops/streams.rs`, lines 60, 277

`_locked` is a public class field (`_locked = false`), meaning any code can set `stream._locked = false` to bypass the lock check. Use a private field (`#locked`) with a getter.

#### N2: `DOMException` code values don't match spec for `DataError` and `OperationError`

**File:** `src/runtime/ops/web_api.rs`, lines 194-195

```js
'DataError': 30,
'OperationError': 34,
```

The W3C DOM spec does not define numeric codes for `DataError` or `OperationError` (these are name-only exceptions). Their `.code` should be `0`. The current values 30 and 34 are invented. While unlikely to cause real issues, it's a spec deviation.

#### N3: `crypto.getRandomValues` copies bytes element-by-element

**File:** `src/runtime/ops/crypto.rs`, lines 113-116

```js
for (let i = 0; i < bytes.length; i++) {
    u8View[i] = bytes[i];
}
```

This could use `u8View.set(bytes)` for better performance:
```js
u8View.set(new Uint8Array(bytes));
```

#### N4: `Response.clone()` creates a new Response with `null` body then overwrites private field

**File:** `src/runtime/ops/web_api.rs`, lines 416-423

```js
const res = new Response(null, { ... });
res.#body = clonedBody;
```

This creates a throwaway body mixin from `null`, then immediately replaces it. Consider adding an internal constructor path that accepts the body mixin directly.

#### N5: `Blob._bytes()` exposes internal method

**File:** `src/runtime/ops/streams.rs`, line 411

The `_bytes()` method is accessible from user code. While prefixed with underscore, it exposes the internal byte buffer which could be mutated. Use a `Symbol` or WeakMap for truly private access.

#### N6: `FormData.keys()` deduplicates keys, but `entries()` and `values()` don't

**File:** `src/runtime/ops/streams.rs`, lines 482-502

`keys()` uses a `Set` to deduplicate (lines 489-495), but per the spec, `FormData.keys()` should NOT deduplicate. It should yield each key once per entry, matching `entries()`.

**Fix:** Remove the `Set` deduplication from `keys()`.

#### N7: `path.dirname("/")` returns `"/"` on Node.js but this impl returns `""`

Due to `PathBuf::from("/").parent()` returning `Some("")` or `None` depending on the platform, the behavior of `dirname("/")` may differ from Node.js which returns `"/"`.

#### N8: Missing `node:url` bare specifier mapping

**File:** `src/runtime/module_loader.rs`, line 746

`"node:url"` is mapped but bare `"url"` is not:
```rust
"node:url" => Some(NODE_URL_SPECIFIER),
```

Node.js also resolves bare `"url"` to the built-in `url` module. Other modules like `"path"`, `"os"`, `"events"`, `"process"`, `"fs"`, `"crypto"`, `"buffer"` all have bare specifier mappings.

#### N9: `op_crypto_random_bytes` has no size limit

**File:** `src/runtime/ops/crypto.rs`, line 68

Unlike `getRandomValues` which enforces a 65536-byte limit, `randomBytes` has no limit. A script calling `randomBytes(2**31)` would allocate 2GB of memory. Consider adding a reasonable upper bound.

## Summary

The implementation is comprehensive and covers a lot of ground across 5 phases. The code quality is generally good with consistent patterns and solid test coverage. The main concerns are:

**Blockers (4):** AES-GCM key selection logic (B1), CryptoKeyStore overflow (B2), undocumented unrestricted FS access (B3), dead code in writeFileSync (B4).

**Should-Fix (10):** Hardcoded arch (S1), hardcoded EOL (S2), SHA-384 HMAC block size (S3), stream error handling (S4), Request body copy (S5), fetch body from Request (S6), type export leak (S7), hardcoded ENOENT (S8), process.exit no-op (S9), blocking crypto (S10).

**NITs (9):** Public _locked fields (N1), invented DOMException codes (N2), element-by-element copy (N3), Response.clone wasteful construction (N4), exposed Blob internals (N5), FormData.keys dedup (N6), dirname root behavior (N7), missing bare url specifier (N8), randomBytes no limit (N9).
