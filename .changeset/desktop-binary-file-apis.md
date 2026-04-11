---
'@vertz/desktop': patch
---

feat(desktop): add binary file read/write APIs with HTTP transport (#2407)

- `fs.readBinaryFile()` / `fs.writeBinaryFile()` — buffered binary I/O via HTTP sidecar (2 GiB limit)
- `fs.readBinaryStream()` / `fs.writeBinaryStream()` — streaming binary I/O with no size limit
- Atomic writes via temp file + rename for crash safety
- Session nonce authentication on all binary routes
- IPC permission enforcement (`fs:read`, `fs:write`)
