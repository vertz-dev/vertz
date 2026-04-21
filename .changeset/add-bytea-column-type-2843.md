---
'@vertz/db': patch
---

feat(db): add `d.bytea()` column type for binary storage

Closes [#2843](https://github.com/vertz-dev/vertz/issues/2843).

New `d.bytea()` column maps to Postgres `BYTEA` and SQLite/D1 `BLOB`, inferring `Uint8Array` at the TypeScript level. Round-trips losslessly: on SQLite reads, `Buffer` and `ArrayBuffer` returned by different drivers are normalized to a plain `Uint8Array` so callers never see backend-specific objects. `.min(n)` / `.max(n)` validate byte length (reuses the `_minLength` / `_maxLength` pipeline — they refine the `@vertz/schema` `instanceof(Uint8Array)` schema).

```ts
const tenant = d.table('tenant', {
  id: d.uuid().primary(),
  encryptedDek: d.bytea(),           // required, any length
  sig: d.bytea().min(64).max(64),    // exactly 64 bytes
  nonce: d.bytea().nullable(),
});
```

Previously, the only options were to base64-encode into `d.text()` (33% size bloat plus an encoding boundary that could corrupt bytes) or abuse `d.jsonb<Uint8Array>()` (JSONB is not designed for opaque bytes). `d.bytea()` removes the encoding step entirely. The migration codegen now emits `d.bytea()` for introspected `BYTEA`/`BLOB` columns instead of `d.text() // TODO: binary type`.

Unblocks the `triagebot` dogfood consumer (`tenant.encryptedDek`, `install.encryptedCredentials`) and any other downstream with AES-GCM ciphertext, compressed payloads, pre-hashed image thumbnails, etc.
