---
'@vertz/runtime': patch
'@vertz/db': patch
---

fix(vtz): native `@vertz/sqlite` now binds `Uint8Array` params and reads BLOBs as `Uint8Array`

Closes [#2920](https://github.com/vertz-dev/vertz/issues/2920).

`d.bytea()` (from [#2843](https://github.com/vertz-dev/vertz/issues/2843)) round-trips on every SQLite binding except the vtz runtime's native `@vertz/sqlite` driver, where writing a `Uint8Array` threw `"invalid type: byte array, expected any valid JSON value"` and reads materialized blobs as JS arrays of integers.

The native op layer now accepts a `SqliteParam` enum (`Json` / `Bytes`) that intercepts serde_v8's byte-array visitor before delegating to `serde_json::Value`, mapping `Uint8Array` params to `rusqlite::Value::Blob`. The read path emits blob cells via `serialize_bytes`, so serde_v8 returns a proper `Uint8Array` to JS instead of a numeric array.

With this fix, `d.bytea()` works under `vtz run` / `vtz dev` against `:memory:` and file-backed SQLite, matching the parity already held by Cloudflare D1, `better-sqlite3`, `bun:sqlite`, and `postgres` / `pg`. The `d.bytea()` JSDoc's driver-support caveat is removed.
