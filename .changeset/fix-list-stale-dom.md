---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

fix(ui): full-replacement mode for unkeyed lists prevents stale DOM

When no `key` prop is provided on list items, `__list` now uses full-replacement mode (dispose all nodes, create all new) instead of reusing by position index. This prevents stale DOM content when list items are filtered, reordered, or replaced. A dev warning is emitted once to encourage adding keys for optimal performance.
