---
'@vertz/runtime': patch
---

fix(vtz): drain child stdout/stderr concurrently in ci scheduler to avoid pipe-buffer deadlock

`vtz ci test` reported packages as `FAILED (exit -1) timeout after 120000ms` even when the underlying test run completed in seconds. Root cause: `execute_command` in the ci scheduler read the child process's piped stdout/stderr only *after* `child.wait()` returned. Once either pipe filled (~16KB on macOS, ~64KB on Linux), the child blocked on its next `write()`, waiting for the parent to drain — which never happened until after `wait()`. Any real test suite emitting more than a few KB of output hit this.

Fixed by draining stdout and stderr concurrently with the wait via `tokio::join!`, including inside the timeout-wrapped branch. Two regression tests generate 512KB of output on stdout and stderr respectively; both complete in ms now.
