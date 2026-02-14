# Canvas Squad Quick Reference 📋

**One-page cheat sheet for the team.**

---

## The Big Picture

**Goal:** Make Canvas/WebGL rendering feel native to vertz.

**Approach:** Wrap PixiJS (don't build from scratch), signals drive updates, hybrid DOM+Canvas.

**Use cases:** Data viz, design tools, games. NOT general web apps.

---

## Key Decisions

| What | Decision | Why |
|------|----------|-----|
| **Rendering engine** | PixiJS | Mature, solves hard problems, 10+ years proven |
| **Architecture** | Hybrid (DOM + Canvas) | Pragmatic, accessible, leverages browser strengths |
| **Layout** | Manual (Phase 1), Yoga later | Start simple, add complexity if needed |
| **Accessibility** | Phase 3 (semantic DOM layer) | Non-negotiable, but defer for POC |
| **Bundle size** | ~460KB (acceptable for target users) | Opt-in package, not core framework |

---

## Phases at a Glance

| Phase | Duration | Goal | Deliverable |
|-------|----------|------|-------------|
| **Phase 0** | 1 week ✅ | Research & validate approach | Roadmap, architecture decision |
| **Phase 1** | 2-3 weeks 🚧 | Proof of concept | Working demo, Go/No-Go decision |
| **Phase 2** | 6-8 weeks ⚪ | MVP package | `@vertz/canvas@0.1.0-alpha` published |
| **Phase 3** | 3-4 months ⚪ | Production-ready | Layout, accessibility, DevTools |

**Current phase:** Phase 1 (Proof of Concept)

---

## Phase 1: What We're Building

**Spike 01 (Week 1):**
- 100 animated sprites driven by signals
- `<Canvas>`, `<Sprite>`, `useTicker` components
- Validate: smooth 60fps, natural API, no blockers

**Week 2-3:**
- 1-2 more examples (chart or game)
- Performance benchmarks
- Go/No-Go decision

**Success criteria:**
- ✅ 60fps with 100+ objects
- ✅ Signals update PixiJS without reconciliation
- ✅ API feels "vertz-like"
- ✅ No major architectural blockers

**Kill criteria:**
- ❌ Performance worse than DOM
- ❌ API feels awkward
- ❌ PixiJS integration too fragile

---

## API Preview (Conceptual)

```tsx
import { Canvas, Sprite, Text } from '@vertz/canvas';
import { signal } from 'vertz';

const x = signal(100);
const score = signal(0);

<Canvas width={800} height={600}>
  <Sprite x={x()} y={100} texture="player.png" />
  <Text text={`Score: ${score()}`} x={10} y={10} />
</Canvas>
```

**Key pattern:** Signals drive PixiJS properties. `effect(() => sprite.x = x())` under the hood.

---

## Team Roles

| Person | Role | Phase 1 Commitment |
|--------|------|-------------------|
| **riley** | PM | 20% — roadmap, coordination, decision-making |
| **kai** | Graphics Lead | 100% — build POC, validate PixiJS integration |
| **edson** | Platform | 25% — build system, packaging |
| **josh** | Research/DX | 10% — API review, docs (shared with main team) |

---

## Communication

**Daily:** Async updates in `#canvas-squad` (optional)  
**Weekly:** 30-min check-in (whole team)  
**Phase gates:** Go/No-Go meetings (with Mike)

**Blockers?** → Post immediately in channel  
**Strategic questions?** → Ask riley  
**CTO involvement?** → Through Mike only

---

## Links

| Doc | Purpose |
|-----|---------|
| [README.md](./README.md) | Squad charter |
| [roadmap.md](./roadmap.md) | Full plan (read this!) |
| [spike-01-animated-sprites.md](./spike-01-animated-sprites.md) | kai's current task |
| [progress.md](./progress.md) | Weekly updates |
| [EXECUTIVE-SUMMARY.md](./EXECUTIVE-SUMMARY.md) | One-pager for Mike |
| [NEXT-ACTIONS.md](./NEXT-ACTIONS.md) | What to do now |

**Research:**
- [webgl-render-target.md](../webgl-render-target.md) — Josh's feasibility study
- [webgl-prior-art-deep-dive.md](../webgl-prior-art-deep-dive.md) — Josh's PixiJS research

---

## PixiJS Crash Course

**Core concepts:**
- **Application:** Root container (creates canvas, manages renderer)
- **Sprite:** Image rendering (textures)
- **Container:** Grouping, transforms (like `<div>`)
- **Graphics:** Vector drawing (shapes, paths)
- **Text:** Text rendering (Canvas2D fallback)

**Scene graph:** Tree structure (like DOM). `app.stage` is root.

**Events:** `sprite.on('pointerdown', handler)` — built-in hit testing.

**Animation:** `app.ticker.add(callback)` — runs every frame.

**Docs:** https://pixijs.com/guides

---

## Success Metrics (Phase 1)

**Performance:**
- [ ] 100 sprites at 60fps
- [ ] 1000 sprites at ___fps (bonus)
- [ ] Memory stable over 5 minutes

**DX:**
- [ ] "Hello world" in <10 minutes
- [ ] API clarity: 8+/10 (team vote)
- [ ] No major WTF moments

**Technical:**
- [ ] Signals → PixiJS without re-render ✅
- [ ] Events work smoothly ✅
- [ ] Bundle size <500KB ✅

---

## Risks to Watch

1. **PixiJS integration pain** → If it's too hard, reconsider approach
2. **Bundle size backlash** → Make opt-in clear, document trade-offs
3. **Performance not better than DOM** → Kill it, no sunk cost
4. **Team burnout** → Time-box phases, willing to kill
5. **Market doesn't care** → Validate demand early

---

## Remember

✅ **Spike mentality:** Fast iteration > perfect code  
✅ **Fail fast:** If it's not working, say so  
✅ **Kill criteria are real:** We're not married to this idea  
✅ **TDD still applies:** Even spikes need tests  
✅ **Have fun:** This is the cool part of engineering

---

## Next Milestone

**By Feb 21:** kai ships Spike 01 (100 animated sprites)

**Acceptance:**
- Working demo (screen recording)
- Code pushed to `explore/canvas-renderer`
- Brief report (what worked, what didn't)

**Then:** Team reviews, decides Go/No-Go for Phase 2.

---

**Questions? → #canvas-squad or DM riley**

**Let's ship! 🚀**
