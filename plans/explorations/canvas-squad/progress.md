# Canvas Squad Progress Tracker

**Last Updated:** 2026-02-14  
**Current Phase:** Phase 1 (Proof of Concept)

---

## Phase 0: Research & Validation ✅ COMPLETE

**Duration:** Feb 7-14, 2026 (1 week)  
**Owner:** josh

### Completed
- [x] Prior art research (Figma, Flutter, PixiJS, Konva, Skia)
- [x] Technical feasibility analysis
- [x] Architecture decision: Hybrid approach + PixiJS backend
- [x] Hard problems identified (text, accessibility, layout)
- [x] Roadmap defined by riley

### Artifacts
- `/workspace/vertz/plans/explorations/webgl-render-target.md`
- `/workspace/vertz/plans/explorations/webgl-prior-art-deep-dive.md`
- `/workspace/vertz/plans/explorations/canvas-squad/roadmap.md`

### Key Decisions
✅ **Use PixiJS as rendering backend** (don't build from scratch)  
✅ **Hybrid approach** (DOM for layout/text, Canvas for graphics)  
✅ **Phase 1 first:** Validate with POC before committing to full build

---

## Phase 1: Proof of Concept 🚧 IN PROGRESS

**Duration:** Feb 14 - Mar 7, 2026 (2-3 weeks)  
**Owner:** kai  
**Supporting:** edson (build), josh (API design)

### Goals
Validate that vertz signals + PixiJS = smooth, performant, and good DX.

### Status: Week 1 (Feb 14-21)

**Current Sprint:**
- [ ] Set up `@vertz/canvas` package structure
- [ ] Install PixiJS dependency
- [ ] Spike 01: 100 animated sprites with signals
- [ ] Initial API design (Canvas, Sprite, Container components)

**Next Up:**
- Build 1-2 more examples (chart or interactive demo)
- Performance benchmarks
- Go/No-Go decision meeting

### Blockers
_None yet. kai hasn't started._

### Risks
- API might feel awkward (PixiJS is imperative, vertz is declarative)
- Signal binding might be more complex than expected
- Performance might not beat DOM for this use case

---

## Upcoming Milestones

| Milestone | Target Date | Owner | Status |
|-----------|-------------|-------|--------|
| Spike 01 complete | Feb 21 | kai | 🟡 Not started |
| Additional examples | Feb 25 | kai | ⚪ Queued |
| Performance benchmarks | Feb 28 | kai | ⚪ Queued |
| Go/No-Go decision | Mar 7 | riley | ⚪ Queued |

---

## Team Capacity

**This week (Feb 14-21):**
- kai: 100% on Canvas Squad (Spike 01)
- edson: 25% (build system setup, as needed)
- josh: 10% (API review, as needed)
- riley: 20% (coordination, planning)

**Next week (Feb 22-28):**
- TBD (depends on Spike 01 progress)

---

## Metrics to Track (Phase 1)

### Performance
- [ ] FPS with 100 sprites: ___ fps
- [ ] FPS with 1000 sprites: ___ fps
- [ ] Memory usage: ___ MB (stable over 5 minutes?)
- [ ] Bundle size: ___ KB (minified + gzipped)

### Developer Experience
- [ ] Time to "hello world": ___ minutes
- [ ] API clarity: ___ / 10 (team vote)
- [ ] PixiJS integration smoothness: ___ / 10 (kai's assessment)

### Technical Validation
- [ ] Signals update PixiJS without full re-render: ✅ / ❌
- [ ] Event handling works smoothly: ✅ / ❌
- [ ] No major architectural blockers: ✅ / ❌

---

## Weekly Updates

### Week of Feb 14, 2026

**Shipped:**
- ✅ Roadmap completed (riley)
- ✅ Spike 01 brief written (riley)
- ✅ Research documents finalized (josh)

**In Progress:**
- 🚧 Package structure setup (kai, starting next)
- 🚧 PixiJS integration spike (kai, starting next)

**Blockers:**
- None

**Next Week Focus:**
- kai builds Spike 01
- Team reviews code mid-week
- Prepare for Go/No-Go discussion

---

## Decision Log

| Date | Decision | Rationale | Owner |
|------|----------|-----------|-------|
| 2026-02-14 | Use PixiJS as backend | Mature, solves hard problems, saves years | riley + josh |
| 2026-02-14 | Hybrid approach (DOM + Canvas) | Pragmatic, solves real problems without over-reach | riley |
| 2026-02-14 | Phase 1 duration: 2-3 weeks | Validate quickly, fail fast if needed | riley |
| 2026-02-14 | TDD still applies (even in spike) | Quality matters, even for experimental code | team |

---

## Open Questions

1. **Context vs. direct parent-child for PixiJS object creation?**
   - Need to decide architecture before coding
   - kai will prototype both, pick one

2. **How to handle PixiJS asset loading?**
   - Async textures (loading state)
   - Preload vs. lazy load
   - Punt to Phase 2?

3. **TypeScript types for signal props?**
   - `x: number | (() => number)` → how to type this cleanly?
   - Can compiler infer signal getters?

4. **What's the second example after Spike 01?**
   - Chart? (data viz)
   - Game? (interactivity)
   - Particles? (performance stress test)

---

## Links

- **Roadmap:** `/workspace/vertz/plans/explorations/canvas-squad/roadmap.md`
- **Spike 01 Brief:** `/workspace/vertz/plans/explorations/canvas-squad/spike-01-animated-sprites.md`
- **Research:** 
  - `/workspace/vertz/plans/explorations/webgl-render-target.md`
  - `/workspace/vertz/plans/explorations/webgl-prior-art-deep-dive.md`
- **Feature Branch:** `explore/canvas-renderer`

---

## Notes

- Mike (VP Eng) will check in weekly via heartbeat
- CTO presentation only happens if we have a working demo (Phase 2+)
- All work stays on feature branch — nothing merges to main until validated

---

**Next Update:** Feb 21, 2026 (end of Week 1)
