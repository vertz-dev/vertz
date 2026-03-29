# Phase 1: Encoding, URL, Base64, structuredClone, queueMicrotask

- **Author:** claude-implementer
- **Reviewer:** claude-reviewer
- **Commits:** 48f959019
- **Date:** 2026-03-29

## Changes

- `native/vertz-runtime/src/runtime/ops/encoding.rs` (new) — TextEncoder, TextDecoder, atob, btoa: 4 Rust ops + JS bootstrap + 16 tests
- `native/vertz-runtime/src/runtime/ops/url.rs` (new) — URL, URLSearchParams: 2 Rust ops + JS bootstrap + 24 tests
- `native/vertz-runtime/src/runtime/ops/clone.rs` (new) — structuredClone via V8 ValueSerializer/ValueDeserializer + 10 tests
- `native/vertz-runtime/src/runtime/ops/microtask.rs` (new) — queueMicrotask (pure JS, Promise-based) + 4 tests
- `native/vertz-runtime/src/runtime/ops/mod.rs` (modified) — added 4 module declarations
- `native/vertz-runtime/src/runtime/js_runtime.rs` (modified) — wired all new ops + bootstrap JS
- `native/vertz-runtime/Cargo.toml` (modified) — added `base64 = "0.22"`, `url = "2"`

## CI Status

- [x] Quality gates passed at 48f959019 (906 tests pass, `cargo test --lib`)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (see findings)
- [ ] No type gaps or missing edge cases (see findings)
- [ ] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER-1: `URL.#reparse()` is completely broken — setters are no-ops

**File:** `url.rs`, lines 273-283

```javascript
#reparse(overrides) {
  const parts = { ...this.#parts, ...overrides };
  try {
    this.#parts = Deno.core.ops.op_url_parse(this.href, '');
  } catch (e) {
    // Keep existing parts if re-parse fails
  }
}
```

The `overrides` object is computed but **never used**. The method re-parses `this.href` (the *current* href, not the modified one), so every setter (`protocol`, `username`, `password`, `host`, `hostname`, `port`, `pathname`) is a silent no-op. Example:

```js
const url = new URL('https://example.com/path');
url.pathname = '/new';
url.pathname; // still '/path' — the setter did nothing
```

This is spec-violating behavior that will silently produce wrong results. The implementation needs to actually reconstruct the href from the merged parts and re-parse that.

**Fix:** Build a new href string from the merged `parts` object, then call `op_url_parse` on that reconstructed string.

---

### BLOCKER-2: `TextDecoder` with `fatal: true` silently replaces invalid bytes instead of throwing

**File:** `encoding.rs`, lines 124-135

The `TextDecoder` accepts `options.fatal` and exposes it via a getter, but the `decode()` method **never checks it**. On the Rust side, `op_text_decode` always calls `String::from_utf8()` which returns `Err` for invalid UTF-8 — but on the JS side, the op throws a generic error. The WHATWG spec says:

- `fatal: false` (default) — Replace invalid bytes with U+FFFD (replacement character)
- `fatal: true` — Throw a `TypeError`

Currently: Both modes throw on invalid bytes because `String::from_utf8` rejects them. The non-fatal default case should use lossy replacement (`String::from_utf8_lossy`) instead.

**Fix:** Pass the `fatal` flag to the Rust op. When `fatal: false`, use `String::from_utf8_lossy()`. When `fatal: true`, use `String::from_utf8()` and throw `TypeError`.

---

### BLOCKER-3: `TextDecoder.decode()` with `ignoreBOM: false` (default) does not strip the UTF-8 BOM

**File:** `encoding.rs`, lines 124-135

The WHATWG Encoding spec says that when `ignoreBOM` is `false` (the default), the decoder MUST strip a leading UTF-8 BOM (`0xEF 0xBB 0xBF`) from the decoded output. The current implementation passes bytes straight through to `String::from_utf8` which preserves the BOM.

```js
const decoder = new TextDecoder(); // ignoreBOM defaults to false
const bom = new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x69]);
decoder.decode(bom); // Should return 'hi', currently returns '\uFEFFhi'
```

**Fix:** In the Rust op or JS wrapper, strip leading BOM bytes when `ignoreBOM` is false.

---

### SHOULD-FIX-1: `URLSearchParams` does not decode `+` as space

**File:** `url.rs`, lines 109-121

The WHATWG URL spec for `application/x-www-form-urlencoded` parsing requires that `+` be treated as a space character *before* percent-decoding. The current implementation uses `decodeURIComponent()` which does NOT decode `+` as space.

```js
const params = new URLSearchParams('q=hello+world');
params.get('q'); // Returns 'hello+world', spec says 'hello world'
```

This will break real-world query strings (every HTML form submission, many APIs).

**Fix:** Replace `+` with space before calling `decodeURIComponent`:
```js
decodeURIComponent(str.replace(/\+/g, ' '))
```
Similarly, `toString()` should encode spaces as `+` (the `encodeURIComponent` already does `%20`, which is technically valid but inconsistent with browser behavior).

---

### SHOULD-FIX-2: `URLSearchParams.delete()` and `has()` are missing the second `value` parameter (WHATWG 2023 addition)

**File:** `url.rs`, lines 141-155

The WHATWG URL spec added an optional second parameter `value` to `delete(name, value)` and `has(name, value)` in 2023. This is implemented in all browsers and runtimes.

```js
params.delete('a', '1'); // Should only delete entries where name='a' AND value='1'
params.has('a', '1');    // Should check for name='a' AND value='1'
```

Currently both ignore the value parameter entirely. While this is not critical for Phase 1, it will cause behavior differences vs browsers.

**Fix:** Check `arguments.length > 1` and filter by value when the second argument is provided.

---

### SHOULD-FIX-3: `URL` error type should be `TypeError`, not a generic error

**File:** `url.rs`, lines 216-218

When `new URL('invalid')` fails, the JS side catches a generic error from the Rust op. Per the WHATWG URL spec, the constructor must throw a `TypeError`. The error message contains "TypeError:" as a string prefix, but the actual exception type thrown by `deno_core` when an op returns `Err` is not a native `TypeError` — it's an `Error`.

```js
try { new URL('invalid'); } catch (e) {
  e instanceof TypeError; // false — it's a generic Error with "TypeError:" in message
}
```

**Fix:** Catch the Rust op error on the JS side and re-throw as `new TypeError(message)`.

---

### SHOULD-FIX-4: `btoa` throws wrong error type for non-Latin1 characters

**File:** `encoding.rs`, lines 33-46

Per the HTML spec, `btoa` must throw a `DOMException` with name `InvalidCharacterError`. The current implementation throws a generic error with "InvalidCharacterError:" in the message. In practice, most non-browser runtimes (Deno, Node) throw `DOMException` or at least a native error, but the `instanceof` check won't work.

Same issue with `atob` for invalid base64 input.

This is a should-fix rather than blocker because `DOMException` itself is not yet implemented in this runtime. But the error type is wrong, and tests that check `instanceof` will fail.

**Fix (short-term):** Acknowledge as known gap and add a TODO. **Fix (long-term):** Implement `DOMException` and throw it from btoa/atob.

---

### SHOULD-FIX-5: `encodeInto` calls `op_text_encode` twice — redundant allocation

**File:** `encoding.rs`, lines 78-102

`encodeInto()` first calls `op_text_encode` to get bytes, copies them into the destination, then calls `op_text_encode` *again* on the exact same string to count characters. This is a double allocation + double UTF-8 encode for no reason — the byte array from the first call is identical.

```javascript
const bytes = Deno.core.ops.op_text_encode(String(source)); // 1st call
const len = Math.min(bytes.length, destination.byteLength);
for (let i = 0; i < len; i++) { destination[i] = bytes[i]; }
// ...
const enc = new Uint8Array(Deno.core.ops.op_text_encode(str)); // 2nd call — identical result!
```

**Fix:** Remove the second `op_text_encode` call and reuse `bytes` from the first call.

---

### SHOULD-FIX-6: `URL.searchParams` mutations do not update `URL.search` or `URL.href`

**File:** `url.rs`, lines 211-284

The `URL` class creates a `URLSearchParams` from `#parts.search` in the constructor, but subsequent mutations to `searchParams` don't flow back to the URL.

```js
const url = new URL('https://example.com/?a=1');
url.searchParams.append('b', '2');
url.href; // Still 'https://example.com/?a=1' — 'b=2' is lost
url.search; // Still '?a=1'
```

Per the WHATWG URL spec, `searchParams` is a "live" object — mutations must update the URL's query component. This requires either:
1. A bi-directional link between URL and URLSearchParams, or
2. A getter on `search`/`href` that reads from `searchParams.toString()`

**Fix:** Make `URL.search` and `URL.href` getters derive from `#searchParams` when params have been mutated.

---

### SHOULD-FIX-7: `structuredClone` does not support the `transfer` option (second argument)

**File:** `clone.rs`, lines 30-74

The WHATWG HTML spec defines `structuredClone(value, { transfer })` where `transfer` is an array of transferable objects (ArrayBuffer, MessagePort, etc.). The current implementation ignores the second argument entirely.

```js
const buf = new ArrayBuffer(8);
const clone = structuredClone(buf, { transfer: [buf] }); // 'transfer' ignored
buf.byteLength; // Should be 0 (neutered), is still 8
```

The `V8 ValueSerializer` supports transfer lists via `transfer_array_buffer`. Not implementing this means code that relies on transfer semantics (zero-copy buffer passing) silently gets copy semantics instead.

**Fix:** Parse the `transfer` option from `args.get(1)`, extract ArrayBuffers, and use the serializer's transfer API.

---

### NIT-1: Missing test for `TextDecoder` with `ArrayBuffer` input

The `decode()` method has a code path for `input instanceof ArrayBuffer` (line 127-128) but tests only exercise `Uint8Array`. Should have a test verifying `decoder.decode(new ArrayBuffer(3))` works.

---

### NIT-2: Missing test for `btoa` with non-Latin1 characters (rejection path)

There's no test verifying that `btoa('\u0100')` (or any code point > 255) throws. The Rust side handles it, but it's untested from the JS integration level.

---

### NIT-3: Missing test for `atob` with invalid base64 input (rejection path)

No test for `atob('not-valid-base64!!!')` throwing an error.

---

### NIT-4: Missing test for `structuredClone` rejecting non-cloneable values

No test for `structuredClone(function() {})` or `structuredClone(Symbol())` which should throw `DataCloneError`.

---

### NIT-5: `URLSearchParams` constructor doesn't handle `undefined`/no-arg case explicitly

When called with `new URLSearchParams()` (no arguments), `init` is `undefined`. The constructor falls through all the `if` branches and does nothing, which is correct behavior. But an explicit test for the no-argument case would be good documentation.

---

### NIT-6: `queueMicrotask` error message doesn't match WHATWG

WHATWG says: "The value passed as the callback must be a Function." Current message: "queueMicrotask requires a function argument." Minor but inconsistent with spec.

---

### NIT-7: `URL.prototype[Symbol.toStringTag]` is not set

Most WHATWG classes define `[Symbol.toStringTag]` so `Object.prototype.toString.call(url)` returns `[object URL]`. Not implemented here.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BLOCKER | 3 | #1 (reparse no-op), #2 (fatal mode), #3 (BOM stripping) |
| SHOULD-FIX | 7 | #1 (+ decoding), #2 (delete/has value), #3 (TypeError), #4 (btoa error type), #5 (encodeInto perf), #6 (searchParams live), #7 (transfer) |
| NIT | 7 | #1-#7 (missing tests, toStringTag, error message) |

### Verdict: **Changes Requested**

The three blockers are all correctness bugs that will cause silent wrong behavior in production code:

1. **URL setters being no-ops** is the most critical — `url.pathname = '/new'` silently failing will break real applications.
2. **TextDecoder fatal mode** and **BOM handling** will cause test failures for any code that relies on standard TextDecoder behavior (which is the whole point of implementing it).

The should-fixes are important for spec conformance but less likely to cause immediate breakage. The `+` as space issue (SHOULD-FIX-1) is the most impactful of these since query string parsing is extremely common.

## Resolution

All 3 blockers and 5 of 7 should-fixes addressed in commit 48757ed81:

| Finding | Status | Notes |
|---------|--------|-------|
| BLOCKER-1: URL.#reparse no-op | **Fixed** | Setters now mutate `#parts` directly and call `#rebuildHref()` |
| BLOCKER-2: TextDecoder fatal mode | **Fixed** | Rust op now takes `fatal` + `ignore_bom` params; non-fatal uses `from_utf8_lossy` |
| BLOCKER-3: BOM stripping | **Fixed** | `strip_prefix('\u{FEFF}')` when `ignoreBOM` is false |
| SHOULD-FIX-1: + as space | **Fixed** | `formDecode()` replaces `+` with space; `formEncode()` replaces `%20` with `+` |
| SHOULD-FIX-2: delete/has value | **Fixed** | Both accept optional second `value` param |
| SHOULD-FIX-3: TypeError | **Fixed** | URL constructor catches op error and re-throws as `TypeError` |
| SHOULD-FIX-4: btoa error type | **Deferred** | Requires `DOMException` class (not yet in runtime). Added as known gap. |
| SHOULD-FIX-5: encodeInto double-encode | **Fixed** | Removed second `op_text_encode` call, reuses `bytes` from first |
| SHOULD-FIX-6: searchParams live | **Fixed** | `URLSearchParams` calls `_onSearchParamsChange()` on URL; href rebuilt |
| SHOULD-FIX-7: transfer option | **Deferred** | V8 serializer supports transfers but not needed for monorepo tests. Phase 4+ |
| NITs 1-5 | **Fixed** | Added tests for ArrayBuffer input, btoa/atob rejection, no-arg constructor |
| NITs 6-7 | **Deferred** | toStringTag and error message wording are cosmetic |

19 new tests added. Total: 925 tests passing.
