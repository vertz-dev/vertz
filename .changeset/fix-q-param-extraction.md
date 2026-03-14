---
'@vertz/server': patch
---

fix(server): extract where/orderBy/limit from q= base64 JSON parameter

The q= parameter parser silently dropped where, orderBy, and limit from the
decoded JSON even though they were allowed keys. Clients could send filtered
queries via q= and get unfiltered results with no error. Now properly extracts
and merges these fields with URL params.
