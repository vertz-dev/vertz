---
'@vertz/cli': patch
---

fix(pm): resolve workspace: protocols during publish

`vtz publish` now resolves `workspace:^`, `workspace:~`, and `workspace:*`
references to actual version numbers before packing and uploading. Previously
these leaked into the published package.json on npm, causing install failures
for consumers.
