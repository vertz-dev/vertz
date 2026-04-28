---
'@vertz/native-compiler': patch
'vertz': patch
---

fix(compiler): use span-overlap (not point) check for mutation ranges in signal transformer

Closes [#2785](https://github.com/vertz-dev/vertz/issues/2785).

`is_in_mutation_range` tested whether `ident.span.start` was a member of a recorded mutation range (`pos >= start && pos < end`). That contract relied on `mutation_analyzer` always recording a span that begins exactly at the identifier's first character — so any future tightening (e.g., the operator-only span for `+=`, or a span recorded on an inner sub-expression) would silently misclassify the identifier as outside the range and double-handle it by appending `.value` on top of the mutation rewrite.

Replaced the point check with a span-overlap check (`ident.start < range.end && ident.end > range.start`), renamed the predicate to `overlaps_mutation_range`, and applied it at all three call sites: identifier reads, assignment-expression LHS, and update-expression targets.
