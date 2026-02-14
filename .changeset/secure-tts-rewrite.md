---
"@vertz/demo-toolkit": patch
---

**SECURITY FIX:** Rewrite TTS functions to prevent shell injection vulnerabilities

- Replace all `execAsync()` shell string interpolation with `spawn()` argument arrays
- Fixes 4 CRITICAL shell injection (RCE) vulnerabilities in:
  - `generateTTS()` - shell injection via `text` and `outputPath`
  - `getAudioDuration()` - shell injection via `audioPath`
  - `combineVideoAudio()` - shell injection via `videoPath`, `audioPath`, `outputPath`
  - `createAudioTimeline()` - shell injection via clip paths and `outputPath`
- Add comprehensive security-focused test suite (14 new tests)
- All tests passing, typecheck passing
- **CVSS 9.8 (Critical) → FIXED**

This fixes the F-grade audit findings from PR #263. All shell parameters are now passed as literal strings via `spawn()` argument arrays, making shell metacharacter injection impossible.
