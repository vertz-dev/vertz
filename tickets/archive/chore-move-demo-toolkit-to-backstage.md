# chore: Move demo-toolkit from vertz to backstage

## Context

`@vertz/demo-toolkit` is internal tooling for creating product demos. It does NOT belong in the public `vertz` framework repo — it should live in `backstage` (our internal/private repo).

## What to Move

- `packages/demo-toolkit/` → `backstage/packages/demo-toolkit/` (or standalone repo)
- All demo scripts, recordings, storyboards
- TTS integration (MiniMax)
- Recording pipeline (Playwright)

## Steps

1. Set up package infrastructure in backstage (package.json, tsconfig, etc.)
2. Move source files
3. Update any imports/references in vertz repo
4. Remove from vertz workspace config
5. Update CI in both repos
6. Verify nothing in vertz depends on demo-toolkit

## Notes

- The demo-toolkit is designed for extraction (see `backstage/demo-toolkit-architecture.md`)
- Each capability (TTS, recording, muxing) should be a self-contained module
- Long-term: may become its own repo with services
- Any current PRs touching demo-toolkit in vertz should be aware of this planned move

## Post-Move Cleanup

After confirming demo-toolkit is committed and pushed in backstage:
- **Scrub demo-toolkit from vertz git history** (not just delete — full history rewrite)
- This includes all PRs that touched `packages/demo-toolkit/`
- Use `git filter-repo` or similar to remove all traces

## Priority

High — do this as soon as current in-flight PRs land (MiniMax TTS PR #275, security fixes PR #273).
