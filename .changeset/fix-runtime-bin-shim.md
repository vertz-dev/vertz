---
'@vertz/runtime': patch
---

Ship Node.js CLI shims (`cli.js`, `cli-exec.js`) so npm creates working `node_modules/.bin/{vtz,vertz,vtzx}` entries. Previously the `bin` field pointed to `./vtz` which was not included in the published tarball.
