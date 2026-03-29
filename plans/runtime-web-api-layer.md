# Runtime Web API Layer — Design Document

> "No ceilings" — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft |
| 2 | 2026-03-29 | Address 6 blockers from DX, Product, and Technical reviews: V8 structuredClone, HKDF/deriveKey, RSA PKCS1v15 via `rsa` crate, Phase 5 split, per-phase checkpoints, KeyObject strategy, EventTarget, fetch op split, body consumption, AbortSignal.any(), Response.clone(), CJS/instanceof non-goals |

---

## Executive Summary

Provide standard **Web Platform APIs** in the Vertz native runtime so that monorepo test files (and eventually production code) can run without Node.js or Bun. The APIs target the **same surface available in Cloudflare Workers, Deno Deploy, and other edge runtimes** — making the Vertz runtime a web-standards-first execution environment.

This is the natural successor to the test runner work. The test runner is complete (Phases 1–4c), but **~270 test files fail to load** because the runtime lacks Web APIs (`TextEncoder`, `crypto.subtle`, `URL`, `Headers`, `Response`, etc.) and Node compatibility shims (`node:fs`, `node:path`, `node:os`). This design addresses both, with Web APIs first.

---

## The Problem

### Current Runtime API Surface

The Vertz runtime (deno_core 0.311.0) provides 7 custom ops modules:

| API | Status |
|---|---|
| `console.*` | Basic (log, warn, error, info) |
| `setTimeout` / `setInterval` | Working |
| `crypto.randomUUID()` | Working |
| `fetch()` | Basic — returns plain JSON object, no `Response`/`Headers` classes |
| `process.env` | Working (Proxy-based) |
| `performance.now()` | Working |
| `path.*` | Working (join, resolve, dirname, basename, extname) |

### What's Missing (Monorepo Failure Analysis)

From the Phase 4c monorepo rollout (793 test files, 78% pass rate), remaining failures break down as:

| Category | Load Failures | Test Failures | Root Cause |
|---|---|---|---|
| **Web APIs** | ~70 | ~30 | `TextEncoder`, `crypto.subtle`, `URL`, `Headers`, `Response`, `Blob` not defined |
| **Node builtins** | ~200 | — | `node:fs`, `node:path`, `node:os`, `node:crypto`, `node:child_process` |
| **bun:sqlite** | ~10 | — | SQLite driver import |
| **CJS/ESM interop** | ~40 | — | `ts-morph` and other CJS-only deps |
| **instanceof cross-module** | — | ~50 | V8 module isolation (known limitation) |
| **Test harness gaps** | — | ~20 | `it.each` object destructuring |

### Why Web APIs First

1. **Edge alignment** — Vertz Cloud runs on Cloudflare Workers. The runtime's API surface should match what's available at the edge. Code that runs in `vertz test` should also run in `vertz deploy`.
2. **Standard over proprietary** — `crypto.subtle.digest('SHA-256')` is a standard. `createHash('sha256')` is Node-specific. The monorepo already uses Web Crypto in production code (`packages/server/src/auth/`).
3. **Smaller surface** — Web APIs are fewer and better specified than Node's. Easier to implement, test, and maintain.
4. **Unlocks Node compat** — Once we have Web Crypto, `node:crypto` can delegate to it. Same for `node:url` → `URL`, etc.

### Phase Ordering Rationale

Phases are ordered **web-standards-first** (Principle 2) rather than by failure count. Web APIs form the foundation that Node compat delegates to (e.g., `node:crypto` → `crypto.subtle`, `node:url` → `URL`). Building the foundation first avoids rework. Phase 4 (Streams) comes before Phase 5 (Node compat) because `Response.body` and streaming `fetch()` responses depend on `ReadableStream`. Phase 3 delivers non-streaming body consumption (`.text()`, `.json()`, `.arrayBuffer()`) without requiring streams.

---

## API Surface

### Phase 1: Encoding, URL, Base64

```typescript
// TextEncoder / TextDecoder (WHATWG Encoding — UTF-8 only)
const encoder = new TextEncoder();
const bytes: Uint8Array = encoder.encode('hello');

const decoder = new TextDecoder('utf-8');
const str: string = decoder.decode(bytes);

// TextDecoder with unsupported encoding → RangeError
new TextDecoder('iso-8859-1'); // throws RangeError: unsupported encoding

// URL / URLSearchParams (WHATWG URL)
const url = new URL('https://example.com/path?q=1');
url.pathname;        // '/path'
url.searchParams.get('q');  // '1'
URL.canParse('not-a-url');  // false

const params = new URLSearchParams('a=1&b=2');
params.get('a');     // '1'
params.append('c', '3');
params.toString();   // 'a=1&b=2&c=3'

// atob / btoa (Base64)
const encoded = btoa('hello');   // 'aGVsbG8='
const decoded = atob(encoded);   // 'hello'

// structuredClone (V8 serialization — preserves Date, Map, Set, RegExp, ArrayBuffer)
const copy = structuredClone({ a: 1, b: new Date(), c: new Map([['k', 'v']]) });

// queueMicrotask
queueMicrotask(() => console.log('microtask'));
```

### Phase 2: Web Crypto

```typescript
// crypto.getRandomValues
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);

// crypto.subtle.digest (SHA-1, SHA-256, SHA-384, SHA-512)
const data = new TextEncoder().encode('hello');
const hash: ArrayBuffer = await crypto.subtle.digest('SHA-256', data);

// crypto.subtle.importKey / sign / verify (HMAC)
const key = await crypto.subtle.importKey(
  'raw',
  keyData,
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);
const sig = await crypto.subtle.sign('HMAC', key, data);

// crypto.subtle.generateKey (RSASSA-PKCS1-v1_5, ECDSA for JWT)
const keyPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);

// crypto.subtle.encrypt / decrypt (AES-GCM for OAuth state)
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  aesKey,
  plaintext,
);

// crypto.subtle.deriveKey (HKDF for key derivation)
const baseKey = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
const derivedKey = await crypto.subtle.deriveKey(
  { name: 'HKDF', hash: 'SHA-256', salt, info },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
```

### Phase 3: Fetch Upgrade (EventTarget, Headers, Request, Response, AbortController)

```typescript
// EventTarget — base class for event-driven APIs
const target = new EventTarget();
target.addEventListener('custom', (e) => console.log(e.type));
target.dispatchEvent(new Event('custom'));

// Headers — proper class, not Map
const headers = new Headers({ 'Content-Type': 'application/json' });
headers.set('Authorization', 'Bearer token');
headers.has('content-type');  // true (case-insensitive)

// Request
const req = new Request('https://api.example.com/data', {
  method: 'POST',
  headers,
  body: JSON.stringify({ key: 'value' }),
});

// Response (body consumed once — second call throws TypeError)
const res = new Response('Hello', { status: 200, headers });
await res.text();      // 'Hello'
res.bodyUsed;          // true
await res.text();      // throws TypeError: body already consumed

// Response.clone() — clone before consuming
const res2 = new Response('data');
const clone = res2.clone();
await res2.text();     // 'data'
await clone.text();    // 'data' — clone has its own body

// Response static methods
Response.json({ ok: true });         // JSON response
Response.redirect('/new', 302);      // Redirect response

// AbortController / AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const res3 = await fetch(url, { signal: controller.signal });

// AbortSignal.timeout() and AbortSignal.any()
const signal = AbortSignal.timeout(5000);
const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);

// fetch() now returns proper Response
const response = await fetch('https://api.example.com');
response.headers.get('content-type');  // proper Headers, not Map
await response.json();
```

### Phase 4: Streams, Blob, FormData

```typescript
// ReadableStream (subset: getReader, async iterable, pipeThrough — no BYOB)
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'));
    controller.enqueue(new TextEncoder().encode('chunk 2'));
    controller.close();
  },
});

// Async iteration
for await (const chunk of stream) {
  console.log(chunk);
}

// TransformStream + pipeThrough
const { readable, writable } = new TransformStream();

// Response with streaming body
const streamRes = new Response(stream, {
  headers: { 'Content-Type': 'text/html' },
});

// Blob
const blob = new Blob(['hello'], { type: 'text/plain' });
await blob.text();        // 'hello'
blob.size;                // 5

// File (extends Blob)
const file = new File(['content'], 'doc.txt', { type: 'text/plain' });
file.name;                // 'doc.txt'
file.lastModified;        // timestamp

// FormData
const form = new FormData();
form.append('name', 'vertz');
form.append('file', file);
form.get('name');         // 'vertz'
```

### Phase 5a: Node Compatibility — Quick Wins

```typescript
// node:path — extends existing path ops
import { join, resolve, dirname, basename, extname, relative, isAbsolute, sep, normalize, posix } from 'node:path';

// node:os — minimal surface
import { tmpdir, homedir, platform, EOL } from 'node:os';

// node:url — delegates to Web URL
import { fileURLToPath, pathToFileURL } from 'node:url';

// node:events — pure JS EventEmitter
import { EventEmitter } from 'node:events';
```

### Phase 5b: Node Compatibility — File System & Crypto

```typescript
// node:fs — file system operations (sync + async)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, renameSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';

// node:crypto → delegates to Web Crypto + Rust ops
import { createHash, timingSafeEqual } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

createHash('sha256').update('hello').digest('hex');
// Internally: sync Rust SHA-256 op + hex conversion
```

**`node:crypto` KeyObject strategy:** `KeyObject` is implemented as a wrapper class around the opaque `CryptoKey` handle, exposing Node-compatible properties (`.type`, `.asymmetricKeyType`, `.asymmetricKeySize`). `generateKeyPairSync` returns `{ publicKey, privateKey }` as `KeyObject` instances. The `jose` library uses `node:crypto` internally — full `jose` compatibility requires that `KeyObject` instances pass `jose`'s type checks. If `jose` does `instanceof KeyObject`, our wrapper must match. If `jose` only duck-types, the wrapper is sufficient. This will be validated during Phase 5b implementation and documented as a known gap if full `jose` compat requires deeper Node internals.

---

## Manifesto Alignment

### Principle 8: No Ceilings
The runtime replaces Bun's built-in APIs with standards-first implementations. Instead of depending on Bun's `node:crypto` compatibility, we provide the Web Crypto API directly — the same API available at the edge.

### Principle 2: One Way to Do Things
Web APIs are *the* way. `node:crypto` exists for backward compatibility but delegates to `crypto.subtle`. New code should use Web APIs directly. The Node compat layer is a bridge, not a destination.

### Principle 7: Performance Is Not Optional
Each op is implemented in Rust, not JS polyfills. `crypto.subtle.digest` calls `sha2` directly. `TextEncoder.encode` uses Rust's UTF-8 conversion. URL parsing uses the `url` crate (WHATWG-compliant, used by Servo/Firefox).

### Principle 1: If It Builds, It Works
The Web API surface is well-specified. Each method has a W3C/WHATWG spec with exact behavior. We implement the spec subset that the monorepo uses, not a best-guess approximation.

---

## Non-Goals

1. **Full WHATWG spec compliance** — We implement the subset used by the Vertz monorepo and common edge patterns. Exotic encodings in `TextDecoder` (e.g., ISO-8859-1, Shift_JIS) are out of scope — UTF-8 only. `TextDecoder` with unsupported encoding throws `RangeError` (matching spec behavior).
2. **DOM APIs** — `document`, `window`, `Element`, etc. are browser-only. UI tests that need DOM use a HappyDOM preload script.
3. **`node:net`, `node:http`, `node:stream`** — Low-level networking modules. The runtime provides `fetch` and `Bun.serve`-equivalent; raw sockets are not needed.
4. **`bun:sqlite`** — SQLite support is a separate feature (native binding or `better-sqlite3` shim). Not part of the Web API layer.
5. **Full Node.js compatibility** — We provide the ~5 most-used Node modules (`fs`, `path`, `os`, `crypto`, `url`). Not a Node.js drop-in replacement.
6. **`Worker` / `SharedArrayBuffer`** — No multi-threading in the runtime for now.
7. **WebSocket client** — Not needed for test execution. Future work.
8. **`node:child_process`** — Process spawning is not edge-aligned (cannot spawn processes in a Worker). Only used by CLI/build-tool tests (~8 files). Deferred to a separate effort after evaluating residual load failures post-Phase 5b.
9. **CJS/ESM interop** — ~40 load failures from CJS-only dependencies (`ts-morph`, etc.) require a CommonJS module evaluation layer. This is a separate, complex feature (module system work, not Web API work). Deferred.
10. **`instanceof` cross-module** — ~50 test failures from V8 module isolation where `instanceof` checks fail across ES module boundaries. This is a V8-level concern, not a missing API. Will be addressed separately via `Symbol.hasInstance` patterns or shared module context.
11. **BYOB readers, advanced `pipeTo()` options** — Streams API subset covers `getReader()`, async iteration, and `pipeThrough()`. BYOB (bring-your-own-buffer) readers and advanced pipe options are out of scope.

---

## Unknowns

### 1. deno_core extension crates vs custom ops

**Question:** Should we use Deno's pre-built extension crates (`deno_web`, `deno_url`, `deno_crypto`) or continue with custom ops?

**Resolution: Custom ops.**

Rationale:
- Deno's extensions have deep interdependencies (`deno_web` requires `deno_webidl`, `deno_console`, `deno_url`; `deno_fetch` requires `deno_web`, `deno_net`, `deno_tls`)
- They bring Deno's permission system, which we don't use
- They're tightly coupled to Deno's specific deno_core version and may not be published independently for 0.311.0
- Our existing ops architecture is clean and proven (7 modules, all working)
- We only need the subset the monorepo uses, not full spec compliance

### 2. crypto.subtle implementation complexity

**Question:** How much of Web Crypto do we need?

**Resolution:** Scoped to monorepo usage:
- `digest`: SHA-1 (TOTP), SHA-256, SHA-384, SHA-512
- `importKey` / `exportKey`: raw, pkcs8, spki, jwk formats
- `sign` / `verify`: HMAC, RSASSA-PKCS1-v1_5, ECDSA (P-256, P-384)
- `generateKey`: HMAC, RSA, ECDSA
- `encrypt` / `decrypt`: AES-GCM
- `deriveKey` / `deriveBits`: HKDF (used by `packages/server/src/auth/crypto.ts` for key derivation)

**Crypto crate strategy:** Use `ring` for HMAC, ECDSA, AES-GCM, HKDF, SHA-*, and random bytes. Use the `rsa` crate for RSASSA-PKCS1-v1_5 signing (ring only supports PKCS1v15 *verification*, not signing — but the monorepo needs RS256 JWT signing via `jose`).

### 3. Sync vs async for `crypto.subtle`

**Question:** Web Crypto is async (`await crypto.subtle.digest(...)`). The monorepo uses it this way. But `createHash` (Node) is sync.

**Resolution:** Web Crypto ops are async (matching the spec). The Node compat `createHash` wraps the Rust SHA-256 call synchronously via a sync op — no event loop involvement.

### 4. `jose` library compatibility with `KeyObject`

**Question:** The `jose` library is used for JWT signing/verification and expects `KeyObject` instances from `node:crypto`. Will our `KeyObject` wrapper class be compatible?

**Resolution:** Investigate during Phase 5b. `jose` uses duck-typing in some paths and `instanceof` in others. If `jose` requires deep Node internals (like `KeyObject[Symbol.for('nodejs.util.inspect.custom')]`), we'll document the gap and provide a `jose`-compatible adapter or test helper. The worst case is that JWT tests using `jose` + `generateKeyPairSync` remain incompatible — but `jose` also supports raw `CryptoKey` (Web Crypto), which is the path we'd prefer new code to take.

---

## POC Results

No POC needed. The existing ops architecture is proven (7 modules, 800+ tests passing). Each new Web API follows the same pattern: Rust op + bootstrap JS + tests.

The `sha2` crate is already a dependency. `ring` is an indirect dependency via `reqwest → rustls-tls`. The `rsa` crate is new but well-established (~10M downloads). `url` crate is trivial to add.

---

## Type Flow Map

Not applicable — this is a runtime API layer, not a generic TypeScript API. No user-facing type generics. The TypeScript types for Web APIs come from `lib.dom.d.ts` / `lib.webworker.d.ts` (standard TS lib files).

---

## E2E Acceptance Test

### Test: Web APIs enable monorepo test execution

```typescript
describe('Feature: Web API layer enables full monorepo test execution', () => {
  describe('Given the Vertz runtime with Web API layer', () => {
    describe('When running vertz test on a file using TextEncoder + crypto.subtle', () => {
      it('Then the file loads without errors', () => {});
      it('Then crypto.subtle.digest returns correct SHA-256 hash', () => {});
    });

    describe('When running vertz test on @vertz/server auth tests', () => {
      it('Then JWT signing with crypto.subtle.sign succeeds', () => {});
      it('Then TOTP verification with HMAC-SHA1 succeeds', () => {});
      it('Then HKDF key derivation for OAuth state encryption succeeds', () => {});
      it('Then all auth tests that pass with bun test also pass with vertz test', () => {});
    });

    describe('When running vertz test on @vertz/fetch tests', () => {
      it('Then fetch() returns proper Response objects with .headers, .status, .ok', () => {});
      it('Then Response.clone() works before body consumption', () => {});
      it('Then AbortController cancellation works', () => {});
    });

    describe('When running vertz test on files using node:fs and node:path', () => {
      it('Then readFileSync/writeFileSync/existsSync work correctly', () => {});
      it('Then path.join/resolve/relative work correctly', () => {});
    });

    describe('When running vertz test on the full monorepo', () => {
      it('Then load failures drop from ~400 to <100', () => {});
      it('Then test pass rate rises from 78% to >90%', () => {});
    });
  });
});
```

**Note on final targets:** The >90% target (not >95%) accounts for ~40 CJS/ESM interop failures, ~50 `instanceof` cross-module failures, and ~10 `bun:sqlite` failures that are out of scope for this design. Achieving >95% requires CJS interop work tracked separately.

---

## Phased Implementation Plan

### Phase 1: Encoding, URL, Base64 (3-4 days)

**Goal:** Provide `TextEncoder`, `TextDecoder`, `URL`, `URLSearchParams`, `atob`, `btoa`, `structuredClone`, `queueMicrotask`. Unblock ~30 load failures.

**Monorepo checkpoint:** ~430 files loading (was 398).

**Deliverables:**

| Op Module | Rust Ops | Bootstrap Globals |
|---|---|---|
| `encoding.rs` | `op_text_encode(string) → Vec<u8>`, `op_text_decode(Vec<u8>, encoding) → string` | `TextEncoder`, `TextDecoder` |
| `url.rs` | `op_url_parse(href) → UrlParts`, `op_url_format(parts) → string`, `op_url_search_params_parse(query) → entries` | `URL`, `URLSearchParams`, `URL.canParse()` |
| `encoding.rs` | `op_atob(string) → string`, `op_btoa(string) → string` | `atob`, `btoa` |
| `clone.rs` | `op_structured_clone(value) → value` via V8 `ValueSerializer`/`ValueDeserializer` | `structuredClone` |
| — (pure JS) | — | `queueMicrotask` (maps to deno_core microtask queue) |

**`structuredClone` implementation:** Uses V8's built-in serialization API (`v8::ValueSerializer` / `v8::ValueDeserializer`) via deno_core. This correctly preserves `Date`, `Map`, `Set`, `RegExp`, `ArrayBuffer`, typed arrays, and handles circular references — matching the HTML spec. Not a JSON hack.

**`TextDecoder` error handling:** Constructor throws `RangeError` for any encoding other than `'utf-8'` (case-insensitive), `'utf8'`, or `'unicode-1-1-utf-8'`. Matches WHATWG spec behavior for unknown encodings.

**Deps:** `url = "2"` crate (WHATWG-compliant URL parser, used by Servo), `base64` crate.

**Acceptance Criteria:**

```typescript
describe('Feature: Encoding and URL APIs', () => {
  describe('Given the TextEncoder global', () => {
    describe('When encoding a UTF-8 string', () => {
      it('Then returns a Uint8Array with correct bytes', () => {});
    });
    describe('When round-tripping encode → decode', () => {
      it('Then returns the original string', () => {});
    });
  });
  describe('Given TextDecoder with unsupported encoding', () => {
    describe('When constructing with "iso-8859-1"', () => {
      it('Then throws RangeError', () => {});
    });
  });
  describe('Given the URL constructor', () => {
    describe('When parsing a valid URL with query params', () => {
      it('Then exposes pathname, search, hash, origin correctly', () => {});
      it('Then searchParams.get() returns parameter values', () => {});
    });
    describe('When constructing a relative URL with a base', () => {
      it('Then resolves correctly', () => {});
    });
    describe('When calling URL.canParse() with an invalid URL', () => {
      it('Then returns false', () => {});
    });
  });
  describe('Given btoa/atob', () => {
    describe('When encoding then decoding', () => {
      it('Then round-trips correctly', () => {});
    });
  });
  describe('Given structuredClone', () => {
    describe('When cloning an object with Date and Map', () => {
      it('Then preserves Date as Date, Map as Map', () => {});
    });
    describe('When cloning a circular reference', () => {
      it('Then handles it correctly without throwing', () => {});
    });
  });
});
```

### Phase 2: Web Crypto (5-6 days)

**Goal:** Provide `crypto.getRandomValues`, `crypto.subtle` (digest, importKey, exportKey, sign, verify, generateKey, encrypt, decrypt, deriveKey, deriveBits). Unblock ~25 load failures across auth, codegen, ui-server.

**Monorepo checkpoint:** ~455 files loading.

**Deliverables:**

| Op Module | Rust Ops | Bootstrap Globals |
|---|---|---|
| `crypto.rs` (extend) | `op_crypto_get_random_values(len) → Vec<u8>` | `crypto.getRandomValues()` |
| `crypto_subtle.rs` | `op_crypto_digest(algo, data) → Vec<u8>` | `crypto.subtle.digest()` |
| `crypto_subtle.rs` | `op_crypto_import_key(format, keyData, algo, extractable, usages) → keyId` | `crypto.subtle.importKey()` |
| `crypto_subtle.rs` | `op_crypto_export_key(format, keyId) → Vec<u8>` | `crypto.subtle.exportKey()` |
| `crypto_subtle.rs` | `op_crypto_sign(algo, keyId, data) → Vec<u8>` | `crypto.subtle.sign()` |
| `crypto_subtle.rs` | `op_crypto_verify(algo, keyId, sig, data) → bool` | `crypto.subtle.verify()` |
| `crypto_subtle.rs` | `op_crypto_generate_key(algo, extractable, usages) → keyId(s)` | `crypto.subtle.generateKey()` |
| `crypto_subtle.rs` | `op_crypto_encrypt(algo, keyId, data) → Vec<u8>` | `crypto.subtle.encrypt()` |
| `crypto_subtle.rs` | `op_crypto_decrypt(algo, keyId, data) → Vec<u8>` | `crypto.subtle.decrypt()` |
| `crypto_subtle.rs` | `op_crypto_derive_key(algo, baseKeyId, derivedAlgo, extractable, usages) → keyId` | `crypto.subtle.deriveKey()` |
| `crypto_subtle.rs` | `op_crypto_derive_bits(algo, baseKeyId, length) → Vec<u8>` | `crypto.subtle.deriveBits()` |

**Key design:** CryptoKey objects are opaque handles. Rust holds the actual key material in an `OpState` map keyed by integer ID. JS gets a `CryptoKey` object with `{ __keyId, type, algorithm, extractable, usages }`. This prevents key material from leaking to JS — matching the Web Crypto security model. Key cleanup is deferred to production runtime work (test runner processes are short-lived, so unbounded growth is acceptable).

**Algorithm coverage:**

| Algorithm | Operations | Crate |
|---|---|---|
| SHA-1, SHA-256, SHA-384, SHA-512 | digest | `ring` |
| HMAC | importKey, sign, verify, generateKey | `ring` |
| RSASSA-PKCS1-v1_5 (RS256, RS384, RS512) | importKey, exportKey, sign, verify, generateKey | `rsa` crate (ring only supports PKCS1v15 verification, not signing) |
| ECDSA (P-256, P-384) | importKey, exportKey, sign, verify, generateKey | `ring` |
| AES-GCM | importKey, encrypt, decrypt, generateKey | `ring` |
| HKDF | importKey, deriveKey, deriveBits | `ring::hkdf` |

**Deps:** `ring` (already indirect via reqwest → rustls), `rsa = "0.9"` (new — for PKCS1v15 signing).

**Acceptance Criteria:**

```typescript
describe('Feature: Web Crypto API', () => {
  describe('Given crypto.getRandomValues', () => {
    describe('When filling a Uint8Array(32)', () => {
      it('Then returns 32 random bytes', () => {});
      it('Then two calls return different values', () => {});
    });
  });
  describe('Given crypto.subtle.digest', () => {
    describe('When hashing "hello" with SHA-256', () => {
      it('Then returns the known SHA-256 hash', () => {});
    });
  });
  describe('Given crypto.subtle.sign with HMAC', () => {
    describe('When signing and verifying data', () => {
      it('Then verify returns true for correct signature', () => {});
      it('Then verify returns false for wrong data', () => {});
    });
  });
  describe('Given crypto.subtle.generateKey with RSASSA-PKCS1-v1_5', () => {
    describe('When generating a 2048-bit RSA key pair', () => {
      it('Then returns a CryptoKeyPair with public and private keys', () => {});
      it('Then sign + verify round-trip succeeds', () => {});
    });
  });
  describe('Given crypto.subtle.encrypt with AES-GCM', () => {
    describe('When encrypting then decrypting data', () => {
      it('Then round-trips to the original plaintext', () => {});
    });
  });
  describe('Given crypto.subtle.deriveKey with HKDF', () => {
    describe('When deriving an AES-GCM key from a base key', () => {
      it('Then the derived key can encrypt and decrypt data', () => {});
    });
  });
});
```

### Phase 3: Fetch Upgrade — EventTarget, Headers, Request, Response, AbortController (5-6 days)

**Goal:** Replace the JSON-blob fetch response with proper Web API classes. Provide `EventTarget` as the base for event-driven APIs. Unblock ~40 load failures from `@vertz/fetch`, `@vertz/ui-server`, `@vertz/server`.

**Monorepo checkpoint:** ~495 files loading.

**Fetch op architectural change:** The current `op_fetch` eagerly buffers the entire response body as a string. This must be split into two ops to support streaming and abort:
- `op_fetch_start(url, options) → { responseId, status, statusText, headers }` — initiates request, returns metadata
- `op_fetch_read_chunk(responseId) → Option<Vec<u8>>` — reads body chunks on demand (returns `None` at EOF)

This enables streaming responses in Phase 4 and allows `AbortController` to cancel mid-stream.

**Deliverables:**

| Component | Implementation | Notes |
|---|---|---|
| `EventTarget` class | Pure JS | `addEventListener()`, `removeEventListener()`, `dispatchEvent()`. Base for `AbortSignal` and future event-driven APIs. |
| `Event` class | Pure JS | `type`, `target`, `currentTarget`, `defaultPrevented`, `preventDefault()` |
| `Headers` class | Pure JS | Case-insensitive, iterable, `entries()`/`keys()`/`values()`/`forEach()`, `getSetCookie()` |
| `Request` class | JS + Rust op | Constructor, `url`, `method`, `headers`, body mixin (`text()`, `json()`, `arrayBuffer()`), `clone()`, `bodyUsed` |
| `Response` class | JS + Rust op | Constructor, `status`, `ok`, `statusText`, `headers`, body mixin, `clone()`, `bodyUsed`, `Response.json()`, `Response.redirect()` |
| `AbortController` / `AbortSignal` | Pure JS (extends EventTarget) | `signal.aborted`, `signal.reason`, `signal.addEventListener('abort', ...)`, `AbortSignal.timeout()`, `AbortSignal.any()` |
| `fetch()` upgrade | Modify existing op → split into start + chunk-read | Use `Request` input, return `Response`, support `signal` option |

**Body consumption:** Body mixin methods (`.text()`, `.json()`, `.arrayBuffer()`) set `bodyUsed = true` on first call and throw `TypeError: body already consumed` on subsequent calls. Both `Request` and `Response` support `.clone()` to create a copy with an independent body stream before consumption.

**Acceptance Criteria:**

```typescript
describe('Feature: Fetch upgrade with proper Web API classes', () => {
  describe('Given the Headers class', () => {
    describe('When setting and getting headers', () => {
      it('Then is case-insensitive', () => {});
      it('Then supports iteration via entries()', () => {});
    });
  });
  describe('Given a Response object', () => {
    describe('When calling .text() and .json()', () => {
      it('Then returns the body content', () => {});
    });
    describe('When calling .text() twice', () => {
      it('Then throws TypeError on second call', () => {});
    });
    describe('When cloning before consuming', () => {
      it('Then both original and clone can be consumed independently', () => {});
    });
    describe('When checking .ok and .status', () => {
      it('Then reflects the HTTP status correctly', () => {});
    });
  });
  describe('Given AbortController', () => {
    describe('When aborting a fetch', () => {
      it('Then fetch rejects with AbortError', () => {});
    });
    describe('When using AbortSignal.any() with multiple signals', () => {
      it('Then aborts when any signal fires', () => {});
    });
  });
  describe('Given EventTarget', () => {
    describe('When adding and dispatching events', () => {
      it('Then listeners are called with the event', () => {});
    });
  });
});
```

### Phase 4: Streams, Blob, FormData (3-4 days)

**Goal:** Provide streaming and binary data APIs. Unblock SSR streaming tests and file upload tests.

**Monorepo checkpoint:** ~510 files loading.

**Streams subset (explicitly scoped):**
- `ReadableStream`: constructor with `start`/`pull`/`cancel`, `getReader()`, async iterable via `Symbol.asyncIterator`, `pipeThrough()`
- `WritableStream`: constructor with `write`/`close`/`abort`, `getWriter()`
- `TransformStream`: constructor, `readable`/`writable` properties
- **Out of scope:** BYOB readers, `pipeTo()` with advanced options (preventClose, preventAbort, preventCancel, signal), `ReadableStream.from()`, byte streams

**Deliverables:**

| Component | Implementation | Notes |
|---|---|---|
| `ReadableStream` | JS + Rust ops for byte sources | Constructor with `start`/`pull`/`cancel`, `getReader()`, async iterable, `pipeThrough()` |
| `WritableStream` | JS + Rust ops | Constructor with `write`/`close`/`abort`, `getWriter()` |
| `TransformStream` | Pure JS | Wraps readable + writable |
| `Blob` | JS + Rust op for storage | Constructor, `text()`, `arrayBuffer()`, `slice()`, `size`, `type` |
| `File` | Pure JS (extends Blob) | `name`, `lastModified` |
| `FormData` | Pure JS | `append()`, `get()`, `getAll()`, `entries()`, `has()`, `delete()`, `set()`, `keys()`, `values()`, `forEach()` |

**Acceptance Criteria:**

```typescript
describe('Feature: Streams, Blob, FormData', () => {
  describe('Given a ReadableStream', () => {
    describe('When reading via getReader()', () => {
      it('Then reads all chunks sequentially', () => {});
    });
    describe('When iterating via for-await-of', () => {
      it('Then yields all chunks', () => {});
    });
    describe('When piping through a TransformStream', () => {
      it('Then data flows from source to sink', () => {});
    });
  });
  describe('Given a Blob', () => {
    describe('When calling .text()', () => {
      it('Then returns the blob content as a string', () => {});
    });
    describe('When calling .slice()', () => {
      it('Then returns a sub-blob with correct content', () => {});
    });
  });
  describe('Given a FormData', () => {
    describe('When appending entries', () => {
      it('Then get() and entries() return correct values', () => {});
    });
  });
});
```

### Phase 5a: Node Compatibility — Quick Wins (2-3 days)

**Goal:** Provide `node:path`, `node:os`, `node:url`, `node:events`. These are small modules that unblock packages with minimal Node dependencies.

**Monorepo checkpoint:** ~530 files loading.

**Approach:** The module loader intercepts `node:*` imports and returns synthetic modules that delegate to either Web APIs or Rust ops.

**Deliverables:**

| Module | Ops | Strategy |
|---|---|---|
| `node:path` | Extend existing `path.rs` with `relative`, `normalize`, `isAbsolute`, `sep`, `posix`, `parse`, `format` | Mostly existing code + additions |
| `node:os` | `op_os_tmpdir`, `op_os_homedir`, `op_os_platform`, `op_os_eol` | Tiny module |
| `node:url` | `op_file_url_to_path`, `op_path_to_file_url` | Delegates to `url` crate |
| `node:events` | — (pure JS bootstrap in synthetic module) | `EventEmitter` class (~80 lines) |

**Acceptance Criteria:**

```typescript
describe('Feature: Node compat quick wins', () => {
  describe('Given node:path', () => {
    describe('When using relative()', () => {
      it('Then computes the correct relative path', () => {});
    });
    describe('When using normalize()', () => {
      it('Then resolves . and .. segments', () => {});
    });
  });
  describe('Given node:os', () => {
    describe('When calling tmpdir()', () => {
      it('Then returns a valid writable directory', () => {});
    });
  });
  describe('Given node:url', () => {
    describe('When calling fileURLToPath()', () => {
      it('Then converts file:// URL to platform path', () => {});
    });
  });
  describe('Given node:events', () => {
    describe('When using EventEmitter', () => {
      it('Then on/emit/removeListener work correctly', () => {});
    });
  });
});
```

### Phase 5b: Node Compatibility — File System & Crypto (5-6 days)

**Goal:** Provide `node:fs`, `node:fs/promises`, and `node:crypto`. These are the heaviest Node modules and account for the bulk of remaining load failures.

**Monorepo checkpoint:** ~710 files loading (~90% of total). Residual: ~40 CJS/ESM, ~10 bun:sqlite, ~30 misc.

**Deliverables:**

| Module | Ops | Strategy |
|---|---|---|
| `node:fs` | `op_fs_read_file`, `op_fs_write_file`, `op_fs_exists`, `op_fs_mkdir`, `op_fs_readdir`, `op_fs_stat`, `op_fs_rm`, `op_fs_rename`, `op_fs_realpath`, `op_fs_watch` | New ops module. Both sync and async variants. Sync ops use `#[op2(fast)]`, async use `#[op2(async)]`. |
| `node:fs/promises` | Same ops, JS wrapper returns Promises | Async wrappers over the same Rust ops |
| `node:crypto` | `op_crypto_create_hash`, `op_crypto_timing_safe_equal` + delegates to Web Crypto | `createHash` → sync Rust SHA op. `timingSafeEqual` → new op. `generateKeyPairSync` → sync Rust keygen op. `KeyObject` wrapper class over `CryptoKey` handle. |

**`node:fs` ops surface (scoped to monorepo usage):**

| Function | Sync | Async | Notes |
|---|---|---|---|
| `readFileSync` / `readFile` | ✓ | ✓ | Returns `Buffer` (UTF-8 string with `encoding: 'utf-8'`) |
| `writeFileSync` / `writeFile` | ✓ | ✓ | |
| `existsSync` | ✓ | — | `fs.exists` is deprecated in Node |
| `mkdirSync` / `mkdir` | ✓ | ✓ | `{ recursive: true }` option |
| `readdirSync` / `readdir` | ✓ | ✓ | Returns `string[]` (no `Dirent` in Phase 5b) |
| `statSync` / `stat` | ✓ | ✓ | Returns `{ isFile(), isDirectory(), size, mtime }` |
| `rmSync` / `rm` | ✓ | ✓ | `{ recursive: true, force: true }` options |
| `renameSync` / `rename` | ✓ | ✓ | |
| `realpathSync` / `realpath` | ✓ | ✓ | Resolves symlinks |
| `watch` | — | ✓ | File watcher (used by tests with tmpdir) |
| `mkdtempSync` | ✓ | — | Used by ~49 test files for temp dirs |
| `unlinkSync` / `unlink` | ✓ | ✓ | |
| `appendFileSync` | ✓ | — | |

**Acceptance Criteria:**

```typescript
describe('Feature: Node compat — fs + crypto', () => {
  describe('Given node:fs', () => {
    describe('When reading and writing files', () => {
      it('Then readFileSync returns file contents as string with utf-8', () => {});
      it('Then readFileSync returns Buffer without encoding', () => {});
      it('Then writeFileSync creates the file', () => {});
      it('Then existsSync returns true for existing files, false for missing', () => {});
    });
    describe('When using directory operations', () => {
      it('Then mkdirSync with recursive creates nested dirs', () => {});
      it('Then readdirSync lists directory contents', () => {});
      it('Then mkdtempSync creates a unique temp directory', () => {});
    });
  });
  describe('Given node:fs/promises', () => {
    describe('When reading asynchronously', () => {
      it('Then readFile returns a Promise that resolves to file contents', () => {});
    });
  });
  describe('Given node:crypto', () => {
    describe('When using createHash', () => {
      it('Then produces the same SHA-256 hex as crypto.subtle.digest', () => {});
    });
    describe('When using timingSafeEqual', () => {
      it('Then returns true for equal buffers', () => {});
      it('Then returns false for different buffers', () => {});
      it('Then throws for different-length buffers', () => {});
    });
  });
  describe('Given the full monorepo after Phase 5b', () => {
    describe('When running vertz test', () => {
      it('Then ~710+ files load successfully (was 398)', () => {});
      it('Then test pass rate exceeds 90%', () => {});
    });
  });
});
```

---

## Performance Targets

| Operation | Target | Notes |
|---|---|---|
| `TextEncoder.encode(1KB)` | < 5μs | Rust UTF-8 conversion + V8 boundary crossing overhead |
| `crypto.subtle.digest('SHA-256', 1KB)` | < 10μs | `ring` or `sha2` crate, no allocation overhead |
| `crypto.subtle.sign('HMAC', key, 1KB)` | < 15μs | `ring` HMAC |
| `crypto.subtle.generateKey('RSA', 2048)` | < 100ms | `rsa` crate keygen (inherently slow) |
| `new URL(href)` | < 1μs | `url` crate WHATWG parser |
| `fetch()` round-trip | Same as reqwest | No additional overhead vs current impl |
| `readFileSync(1KB)` | < 50μs | Direct `std::fs::read` |
| `writeFileSync(1KB)` | < 100μs | Direct `std::fs::write` |
| `existsSync()` | < 20μs | `std::path::Path::exists()` |
| `mkdirSync()` | < 50μs | `std::fs::create_dir_all()` |

---

## Key Files (Implementation)

### New files to create

```
native/vertz-runtime/src/runtime/ops/
├── encoding.rs          # TextEncoder, TextDecoder, atob, btoa
├── url.rs               # URL, URLSearchParams
├── clone.rs             # structuredClone via V8 serialization
├── crypto_subtle.rs     # crypto.subtle.* (digest, sign, verify, generate, encrypt, decrypt, deriveKey)
├── event_target.rs      # EventTarget, Event (pure JS bootstrap)
├── abort.rs             # AbortController, AbortSignal (pure JS bootstrap, extends EventTarget)
├── headers.rs           # Headers class (pure JS bootstrap)
├── request_response.rs  # Request, Response classes + body mixin
├── streams.rs           # ReadableStream, WritableStream, TransformStream
├── blob.rs              # Blob, File
├── formdata.rs          # FormData (pure JS bootstrap)
├── node_fs.rs           # node:fs and node:fs/promises ops
├── node_os.rs           # node:os ops
├── node_crypto.rs       # node:crypto → Web Crypto bridge + sync hash/keygen ops
```

### Existing files to modify

| File | Change |
|---|---|
| `src/runtime/js_runtime.rs` | Register new ops modules, add bootstrap JS |
| `src/runtime/module_loader.rs` | Intercept `node:*` imports, return synthetic modules |
| `src/runtime/ops/crypto.rs` | Extend with `getRandomValues` |
| `src/runtime/ops/fetch.rs` | Split into `op_fetch_start` + `op_fetch_read_chunk`, return proper Response |
| `src/runtime/ops/path.rs` | Add `relative`, `normalize`, `isAbsolute`, `parse`, `format`, `posix` |
| `Cargo.toml` | Add `ring`, `rsa`, `url`, `base64` crates |

---

## Dependency Budget

| Crate | Purpose | Size Impact |
|---|---|---|
| `ring` | Crypto: HMAC, ECDSA, AES-GCM, HKDF, SHA-*, random (already indirect via reqwest → rustls) | ~0 (already linked) |
| `rsa = "0.9"` | Crypto: RSASSA-PKCS1-v1_5 signing (ring only supports PKCS1v15 verification) | ~200KB |
| `url = "2"` | WHATWG URL parsing | ~50KB |
| `base64` | atob/btoa | ~15KB |

Total new dependency footprint: **~265KB** (ring is free since it's already linked).

---

## Review Checklist

- [ ] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues
- [ ] Public API changes match design doc
