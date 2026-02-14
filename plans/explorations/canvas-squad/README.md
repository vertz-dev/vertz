# Canvas Squad 🎨

**Mission:** Explore and validate WebGL/Canvas as an alternative render target for vertz.

**Status:** 🚀 Active — Phase 1 (Proof of Concept) starting

## Current Focus (Phase 1)

**📍 We are here:** Validating PixiJS + vertz signals with a proof-of-concept.

**This week:** kai builds Spike 01 — 100 animated sprites driven by signals.

**Goal:** Prove the approach works (smooth, performant, good DX) before investing in full build.

**Read first:**
- 📋 **[Roadmap](./roadmap.md)** — full plan, phases, acceptance criteria
- 🎯 **[Spike 01 Brief](./spike-01-animated-sprites.md)** — kai's immediate task
- 📊 **[Progress Tracker](./progress.md)** — weekly updates, metrics

---

## Team

| Role | Agent | Responsibility |
|------|-------|----------------|
| **Product Manager** | riley | Vision, roadmap, phase planning, progress tracking |
| **Graphics Lead** | kai | PixiJS integration, performance optimization, proof-of-concept |
| **Platform Engineer** | edson | Build system, packaging, CI/CD, tooling |
| **Research/DX** | josh | Prior art analysis, API design, documentation (shared with main team) |

## Operating Rules

1. **Feature branch:** `explore/canvas-renderer` — long-lived, rebases from main periodically
2. **No PRs to main** — this is experimental. When something is validated, we'll plan integration separately
3. **Own roadmap** — defined by riley (PM), not tied to the main UI roadmap
4. **Weekly check-ins** — mike reviews progress, escalates to CTO only for strategic decisions
5. **TDD still applies** — experimental doesn't mean sloppy
6. **Research-first** — analyze before building. Understand Figma, PixiJS, Skia, Yoga before writing code
7. **Pull from main** — periodically rebase to stay compatible with framework changes

## Communication

- Squad uses their own workspace: `/workspace/canvas-squad/`
- Progress tracked in `/workspace/vertz/plans/explorations/canvas-squad/progress.md`
- Mike checks in during heartbeats

## Key Questions to Answer (Phase 0)

1. Build renderer from scratch vs. wrap PixiJS/Skia?
2. Hybrid (DOM + Canvas zones) vs. full Canvas?
3. What's the minimum viable proof-of-concept?
4. How does accessibility work? (non-negotiable — Law 1)
5. What's the developer API? How do you opt a component into Canvas rendering?

## Foundation Documents

- ✅ Josh's feasibility study: [`webgl-render-target.md`](../webgl-render-target.md)
- ✅ Josh's deep dive on PixiJS: [`webgl-prior-art-deep-dive.md`](../webgl-prior-art-deep-dive.md)
- 📋 Riley's roadmap: [`roadmap.md`](./roadmap.md)
- 🎯 Current spike: [`spike-01-animated-sprites.md`](./spike-01-animated-sprites.md)
