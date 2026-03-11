---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add optional onMiss telemetry callback to FieldSelectionTracker for compiler miss detection, and recordFieldMiss method to DiagnosticsCollector for surfacing misses via /__vertz_diagnostics endpoint
