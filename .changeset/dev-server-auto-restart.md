---
'@vertz/ui-server': patch
---

Add automatic restart for stale module graph errors (Phase 3). When a stale-graph error is detected, the server and client now auto-trigger a restart without user interaction. Includes restart loop prevention (max 3 auto-restarts within 10s window) with fallback to the manual "Restart Server" button.
