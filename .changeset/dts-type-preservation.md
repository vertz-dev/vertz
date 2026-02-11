---
'@vertz/db': patch
'@vertz/core': patch
'@vertz/schema': patch
---

Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.
