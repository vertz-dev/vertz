# Review: Image Optimization Proxy (#2055) -- All Phases

- **Author:** Claude (implementation agent)
- **Reviewer:** Claude (review agent)
- **Date:** 2026-04-04

## Files Reviewed

- `native/vtz/src/server/image_proxy.rs`
- `native/vtz/src/server/image_cache.rs`
- `native/vtz/src/server/mod.rs`
- `native/vtz/src/server/http.rs`
- `native/vtz/src/config.rs`
- `native/vtz/Cargo.toml`
- `plans/2055-image-optimization-proxy.md`

## CI Status

- [x] Quality gates passed (cargo test + clippy + fmt)

## Findings

### Blockers (must fix before merge)

**B1. `percent_decode` corrupts multi-byte UTF-8 sequences**

`image_proxy.rs:249-265` -- The `percent_decode` function decodes percent-encoded bytes individually and pushes each byte as a `char` via `byte as char`. This is correct for ASCII but **breaks multi-byte UTF-8**. A file named `caf%C3%A9.png` would produce `caf\u{C3}\u{A9}.png` (two separate Latin-1 characters) instead of `cafe.png` (the UTF-8 sequence `0xC3 0xA9` = U+00E9).

The function should accumulate decoded bytes into a `Vec<u8>` and then convert to `String` via `String::from_utf8_lossy` (or error). The same bug exists on line 261 where raw bytes are pushed as chars: `result.push(bytes[i] as char)` -- this is only safe for ASCII bytes.

Fix: collect decoded bytes into a `Vec<u8>` and do a final UTF-8 conversion.

**B2. WebP quality parameter is silently ignored**

`image_proxy.rs:320-323` -- The WebP branch uses `img.write_to(&mut buf, ImageFormat::WebP)` which uses the `image` crate's default WebP encoder settings. The `quality` parameter is **only applied for JPEG** (line 325 uses `JpegEncoder::new_with_quality`). For WebP, the quality setting is silently dropped. A request like `?w=800&format=webp&q=50` will encode at the library's default quality, not quality=50.

The `image` crate provides `image::codecs::webp::WebPEncoder` which accepts a quality parameter. Use `WebPEncoder::new_with_quality(&mut buf, WebPQuality::lossy(quality))` or equivalent API for the 0.25 version.

This means the cache key includes quality but two requests with different `q` values would produce identical output for WebP, wasting cache space on duplicate entries that are byte-identical.

**B3. Cache key collision: `None` width/height maps to same value as `Some(0)`**

`image_cache.rs:36-37` -- `width.unwrap_or(0).to_le_bytes()` maps both `None` and `Some(0)` to the same 4-byte representation. While `Some(0)` is rejected at parse time (validation rejects width=0), this is a latent correctness issue. If validation logic ever changes, two semantically different requests (no resize vs. resize to 0) would share a cache key.

More critically, there's no delimiter or length-prefix between the variable-length fields (`source_path` and `format_ext` and `fit`). The hash input for path="ab" + format="cde" is identical to path="abc" + format="de" -- a collision. While this is hard to exploit in practice (file names that exactly match this pattern are unlikely), it's a correctness bug in the hash construction.

Fix: Add a delimiter byte (e.g., `0x00` or length-prefix) between variable-length fields:
```rust
hasher.update(source_path.to_string_lossy().as_bytes());
hasher.update([0u8]); // delimiter
// ... fixed-length fields ...
hasher.update(format_ext.as_bytes());
hasher.update([0u8]); // delimiter
hasher.update(fit.as_bytes());
hasher.update([0u8]); // delimiter
```

### Should Fix (strongly recommended)

**S1. Synchronous file I/O on the async handler**

`image_proxy.rs:399-417` -- `std::fs::metadata()` and `std::fs::read()` are blocking I/O calls executed directly inside the async `handle_image_request` function, which runs on the tokio runtime. For large images (the design doc allows up to 8192x8192, which could be tens of MB), this blocks the tokio worker thread.

The image processing is correctly wrapped in `spawn_blocking`, but the file read preceding it is not. Either:
1. Move the file read into the `spawn_blocking` closure alongside the image processing, or
2. Use `tokio::fs::metadata()` and `tokio::fs::read()`

The cache `get()` (line 449) and `put()` (line 476) calls also use synchronous `std::fs::read`/`std::fs::write` but are outside `spawn_blocking`. Consider the same treatment.

**S2. No maximum source file size check**

There is no limit on the size of the source file read into memory. A user could place a 500MB TIFF (or a large PNG) in `public/` and request it via the proxy, causing unbounded memory allocation at `std::fs::read()`. The design doc mentions "prevents OOM from absurd dimensions" for width/height, but the source file size is unchecked.

Recommendation: Add a `MAX_SOURCE_FILE_SIZE` constant (e.g., 50MB) and check `metadata.len()` before reading.

**S3. No test for height-only resize path**

`image_proxy.rs:303` -- The `(None, Some(h))` resize arm calls `img.resize(u32::MAX, h, ...)` but there is no test that exercises this path. There is `process_image_resize_width_only` but no `process_image_resize_height_only`.

**S4. `validate_path` TOCTOU: canonicalize then read is racy**

`image_proxy.rs:339-351` and `399-417` -- There is a time-of-check-to-time-of-use gap between `validate_path` (which canonicalizes and checks the path is within `public/`) and the subsequent `std::fs::read`. A symlink could be created between the two calls that points outside `public/`. In a dev server context this is low-risk (the attacker would need local filesystem access), but it's worth noting.

**S5. `json_error` response uses `.unwrap()` on the response builder**

`image_proxy.rs:364-369`, line 456, line 485 -- The `.unwrap()` calls on `axum::response::Response::builder()...body(...)` will panic if the builder is in an error state (e.g., an invalid header value). While this is unlikely with the current hardcoded headers, panicking in a request handler crashes the connection. Consider using `.unwrap_or_else()` with a fallback 500 response, or at minimum document why the unwrap is safe.

**S6. Design doc `MissingParam` error variant was dropped without note**

The design doc's `ImageProxyError` enum (section 6, Key Types) includes `MissingParam(&'static str)` but the implementation does not. The implementation replaced it with `NothingToDo` which covers the "no params" case. This is arguably better, but the deviation from the design doc should be documented in the commit message or PR description.

### Nits (optional improvements)

**N1. `parse_query` does not percent-decode parameter values**

`image_proxy.rs:236-246` -- Query parameter values are not percent-decoded. A request like `?format=web%70` (which percent-encodes "webp") would fail with "Unsupported format: web%70". This is an edge case since browsers/tools rarely percent-encode these simple ASCII values, but a fully compliant URL parser would decode them.

**N2. `ImageCache::new` allocates on every request**

`image_proxy.rs:430` -- A new `ImageCache` struct is created for every request. While it's just a `PathBuf` wrapper (cheap), it could be stored in `DevServerState` or computed once. The `ensure_dir()` call inside `put()` also calls `create_dir_all` on every cache write.

**N3. The `from_extension` method handles both `.png` and `png` (with/without dot)**

This is good defensive coding (`trim_start_matches('.')`) but the inconsistency could surprise callers. Consider documenting this behavior on the method.

**N4. `handle_image_request` unwrap_or fallback in path prefix stripping**

`image_proxy.rs:381-383` -- The `unwrap_or(path.trim_start_matches('/'))` fallback should never be reached since the handler is only called when `path.starts_with("/__vertz_image/")`. A `debug_assert!` or logging on the fallback path would help catch integration bugs early.

**N5. Consider `Content-Length` header on responses**

The response body length is known (it's a `Vec<u8>`), but no `Content-Length` header is set. axum/hyper may set it automatically for `Body::from(Vec<u8>)`, but explicitly setting it is clearer and ensures correct behavior with all HTTP clients.

## Design Doc Alignment

The implementation closely follows the design doc with the following deviations:

1. **`MissingParam` variant removed** -- Replaced by `NothingToDo`. Functionally equivalent but the error variant name and message differ from the design doc's "Missing required parameter: {0}". This is an improvement (the NothingToDo message is clearer).

2. **`ProcessedImage` struct not used** -- The design doc defines `ProcessedImage { bytes: Vec<u8>, format: OutputFormat }` but the implementation returns `Vec<u8>` directly from `process_image()`. The format is known from the request context so wrapping it in a struct is unnecessary. This simplification is fine.

3. **Route integration matches the design doc** -- `http.rs` line 745 dispatches `/__vertz_image/` exactly as specified. The ordering (after `/@deps/`, `/@css/`, `/src/`, before `/api/` and static files) is correct.

4. **File structure matches** -- `image_proxy.rs`, `image_cache.rs`, `mod.rs` registration, `config.rs` `images_dir()`, and `http.rs` dispatch all match the design doc's "File Structure" section.

5. **Dependencies match** -- `image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }` matches exactly.

6. **All query parameters implemented** -- `w`, `h`, `format`, `q`, `fit` with correct defaults (q=80, fit=cover).

7. **Error status codes match** -- 400 for validation, 404 for not found, 500 for decode/encode.

8. **Cache headers match** -- `Cache-Control: no-cache`, `X-Vertz-Image-Cache: hit/miss` as specified.

## TDD Compliance

### Well-tested areas:
- OutputFormat parsing: all variants, case insensitivity, unknown values
- ResizeFit parsing: all variants, case insensitivity, unknown values
- Error status codes: all variants tested
- ImageRequest::parse: full params, width-only, format-only, nested paths, percent-encoded paths, all validation errors
- CacheKey: determinism, uniqueness for all parameter variations, filename format
- ImageCache: miss, hit, roundtrip, directory creation, key independence
- process_image: width-only resize, both-cover, both-contain, both-fill, format-only, WebP/JPEG encoding, invalid bytes
- validate_path: valid file, traversal, not found, nested

### Test gaps:
1. **No height-only resize test** -- The `(None, Some(h))` arm at line 303 is untested
2. **No `json_error` unit test** -- The error response builder is untested
3. **No `handle_image_request` integration test** -- The full handler (with `DevServerState`) is not tested. All async flow, cache integration, and format-inference-from-extension logic is untested at the integration level
4. **No test for format inference from file extension** -- When `format` is not specified, `output_format` falls back to the source file's extension. This logic (lines 420-426) is not tested
5. **No test for `parse_height_only` parse path** -- There's `parse_width_only` but no `parse_height_only`
6. **No test verifying cache key includes height** -- `cache_key_different_height_different_hash` is missing (there's width, quality, format, fit, path, mtime -- but not height)

## Security Review

### Path traversal: ADEQUATE
The `canonicalize() + starts_with()` approach is the standard Rust defense against path traversal. `canonicalize()` resolves symlinks and `..` components, and `starts_with()` on canonicalized paths checks real filesystem hierarchy. This is tested with `../secret.txt`.

### DoS vectors: PARTIALLY ADDRESSED
- **Dimension limits**: MAX_DIMENSION=8192 prevents absurd resize targets. Good.
- **Source file size**: NOT limited. A large source file in `public/` would be fully read into memory. Should-fix S2.
- **Concurrent requests**: No rate limiting or concurrent request cap for the CPU-heavy image processing. An attacker could send many simultaneous requests for different parameters of the same image, causing `spawn_blocking` thread pool exhaustion. Acceptable for a dev server, but worth a comment.
- **Cache size**: No limit on total cache disk usage in `.vertz/images/`. Many unique parameter combinations could fill disk. Acceptable for dev server (cleaned by `vtz clean`).

### Error information leakage: LOW RISK
- Path traversal returns generic "Path traversal not allowed" (no path details leaked)
- NotFound returns the relative source path (acceptable for dev server)
- Decode/Encode errors pass through the `image` crate's error messages, which could include internal details. Acceptable for dev server.

### Symlink following: NOTED (S4)
`canonicalize()` follows symlinks. A symlink inside `public/` pointing outside `public/` would be followed, but `starts_with()` would catch it. A TOCTOU race is theoretically possible but low-risk in a dev context.

## Verdict

**Changes Requested**

Three blockers must be resolved:
1. **B1**: `percent_decode` corrupts multi-byte UTF-8 -- this will cause 404s for filenames with non-ASCII characters
2. **B2**: WebP quality parameter silently ignored -- users would see no effect from `q=` param on WebP output, violating the documented API contract
3. **B3**: Cache key hash collision due to no delimiters between variable-length fields -- could serve stale/wrong cached images

The should-fix items (S1-S6) are strongly recommended but individually not merge-blocking. However, S3 (missing height-only test) and S2 (no file size limit) should also be addressed.

The implementation is well-structured, follows the design doc closely, and the test coverage is solid for the unit-level behaviors. The main gaps are in the areas identified above.
