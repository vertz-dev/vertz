---
'@vertz/runtime': patch
---

fix(vtz): apply requested viewport before rendering screenshots

Closes [#2949](https://github.com/vertz-dev/vertz/issues/2949).

`vertz_browser_screenshot` was rendering every PNG at the launch
viewport (1280x720) regardless of the `viewport` arg passed to the MCP
tool. The metadata reported the requested dimensions back, but the
rasterized image and on-disk filename did not match.

`ChromiumoxideHandle::capture` now opens a blank page first, applies
`Emulation.setDeviceMetricsOverride` with `req.viewport`, and only then
navigates to the URL — so responsive layouts see the requested viewport
from the initial render. Cross-viewport visual QA (the #2865 dogfood
goal) works through this tool again.
