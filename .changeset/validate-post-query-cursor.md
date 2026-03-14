---
'@vertz/server': patch
---

fix(server): POST /query now validates cursor length at route level

The POST /query endpoint was passing `body.after` directly to the CRUD pipeline
without checking its length. The GET route used `parseVertzQL` which goes through
the pipeline's silent 512-char guard, but POST /query bypassed this. Now returns
400 BadRequest when the cursor exceeds MAX_CURSOR_LENGTH (512).
