---
'@vertz/ui-compiler': patch
---

Distinguish reactive reads from stable closure references in computed classification. Callbacks that only call plain methods (`.refetch()`, `.revalidate()`) on signal API vars now stay `static` instead of being unnecessarily wrapped in `computed()`. Only accesses to signal properties (`.data`, `.error`, `.loading`) trigger computed classification.
