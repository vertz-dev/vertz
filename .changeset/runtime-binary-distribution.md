---
'@vertz/cli': patch
'@vertz/runtime': patch
'@vertz/runtime-darwin-arm64': patch
'@vertz/runtime-darwin-x64': patch
'@vertz/runtime-linux-x64': patch
'@vertz/runtime-linux-arm64': patch
---

Add npm-based distribution for the Vertz native runtime binary. Platform-specific packages (@vertz/runtime-{platform}-{arch}) contain the pre-built binary, and @vertz/runtime provides a single getBinaryPath() API for resolution. The CLI now uses the native runtime by default with automatic Bun fallback.
