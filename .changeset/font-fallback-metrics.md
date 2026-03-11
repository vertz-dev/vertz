---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add automatic font fallback metric overrides for zero-CLS font loading. The framework now extracts font metrics from .woff2 files at server startup and generates adjusted fallback @font-face blocks with ascent-override, descent-override, line-gap-override, and size-adjust. This eliminates layout shift when custom fonts load with font-display: swap.
