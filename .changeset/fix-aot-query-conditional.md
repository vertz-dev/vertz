---
'@vertz/ui-compiler': patch
---

Fix AOT SSR classifier for query() + conditional return patterns: guard patterns (if-return + main return) are now classified as 'conditional' instead of 'runtime-fallback', and ternary/&& returns containing JSX are no longer silently dropped from the components array.
