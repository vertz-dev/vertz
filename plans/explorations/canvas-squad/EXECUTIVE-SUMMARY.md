# Canvas Squad: Executive Summary

**Date:** 2026-02-14  
**To:** Mike (VP Engineering)  
**From:** riley (Canvas Squad PM)  
**Re:** Phase 1 Approval Request — WebGL/Canvas Rendering POC

---

## TL;DR

We want **2-3 weeks** and **1 engineer (kai)** to prove that **vertz + PixiJS** can deliver smooth Canvas rendering with great DX.

**If it works:** We have a differentiated feature for data viz, design tools, and high-performance UIs.  
**If it doesn't:** We kill it early and lose only 3 weeks.

**Approval needed:** Go ahead with Phase 1 (Proof of Concept).

---

## What We're Building

**Vision:** Let vertz developers opt into WebGL/Canvas rendering for performance-critical zones while keeping DOM for everything else.

**Example use case:**
```tsx
<div class="dashboard">
  <header>My App</header>
  
  {/* This renders to Canvas (WebGL) — 60fps, thousands of data points */}
  <Canvas>
    <LineChart data={signal.realtimeData} />
  </Canvas>
  
  <footer>Status: {signal.status}</footer>
</div>
```

**Why this matters:**
- **Data visualization:** Real-time charts, dashboards (Trading platforms, monitoring tools)
- **Design tools:** Figma-like editors (pixel-perfect, fast interactions)
- **Games & interactive experiences:** 2D games, creative coding, generative art
- **High-performance UI:** Thousands of updating elements (particle systems, network graphs)

**Not for:** Content sites, SEO pages, general CRUD apps. DOM is still the default.

---

## Strategy: Build vs. Buy

**Decision:** Wrap **PixiJS** (mature WebGL rendering library), don't build from scratch.

**Why PixiJS?**
- 10+ years old, battle-tested (used in thousands of games, data viz tools)
- Solves hard problems: text rendering, events, asset loading, WebGL optimization
- Active development, strong community
- ~460KB bundle (acceptable for target use cases)

**Why not build our own?**
- Text rendering alone is 1-2 years of work (see Figma's journey)
- WebGL expertise is rare, PixiJS has it solved
- Saves years, lets us focus on vertz's unique value (signals + compiler)

**Pattern:** Same as React Three Fiber (wraps Three.js), Solid-three (wraps Three.js).

---

## What Josh's Research Found

Josh spent a week analyzing prior art (Figma, Flutter Web, React Three Fiber, PixiJS, Konva). Key findings:

### ✅ What's Proven to Work
- **PixiJS as backend:** Mature, performant, handles edge cases
- **Hybrid approach:** DOM for layout/text, Canvas for graphics (pragmatic)
- **Fine-grained reactivity:** Vertz signals → direct PixiJS updates (better than React's reconciliation)

### ❌ What to Avoid
- **Custom WebGL renderer:** Multi-year project, not worth it
- **Canvas-only UI:** Accessibility nightmare, reinventing the wheel
- **Skia/CanvasKit (Flutter Web's approach):** 600KB+ bundle, slow startup, overkill

### 🔴 Hard Problems
- **Text rendering:** PixiJS solves it (Canvas2D fallback, good enough)
- **Accessibility:** Need semantic DOM layer (Phase 3)
- **Layout:** Manual positioning for now, Yoga (Flexbox) later if needed

**Recommendation:** Build hybrid system with PixiJS backend. Start with POC to validate.

Full research: [`webgl-prior-art-deep-dive.md`](../webgl-prior-art-deep-dive.md)

---

## Phase 1: Proof of Concept (What We're Asking For)

### Timeline
**2-3 weeks** (Feb 14 - Mar 7, 2026)

### Resources
- **kai:** 100% (builds the POC)
- **edson:** 25% (build system setup, as needed)
- **josh:** 10% (API review, as needed)
- **riley:** 20% (coordination, decision-making)

### Goals
Validate 3 things:
1. **Performance:** Signals + PixiJS = smooth 60fps rendering
2. **DX:** API feels natural (declarative JSX, signals work like normal vertz)
3. **Feasibility:** No major architectural blockers

### Deliverables
- Minimal `@vertz/canvas` package (alpha, not published)
- 1-2 working examples (animated sprites, maybe a chart)
- Performance benchmarks (FPS, memory, bundle size)
- **Go/No-Go decision:** Continue to Phase 2 (MVP) or kill it?

### First Spike (Week 1)
kai builds: **100 animated sprites driven by signals.**

**Acceptance criteria:**
- `<Canvas><Sprite x={signal.x} /></Canvas>` renders smoothly
- 60fps with 100 sprites
- Code feels "vertz-like" (no hacks or workarounds)

**If this fails:** We stop. No sunk cost fallacy.

Full roadmap: [`roadmap.md`](./roadmap.md)

---

## Success Criteria (Phase 1)

**Must achieve:**
- [ ] 100+ animated objects at 60fps
- [ ] Signals update PixiJS without reconciliation overhead
- [ ] API feels natural (team consensus: "This is nice to use")
- [ ] No major blockers (PixiJS integrates smoothly)

**Go to Phase 2 if:**
- ✅ All criteria met
- ✅ Team agrees: "This works, let's build it for real"
- ✅ Performance beats DOM for the use case

**Kill it if:**
- ❌ Performance is worse than DOM
- ❌ API is too awkward (doesn't feel like vertz)
- ❌ PixiJS integration is fragile (too many hacks)

---

## What Happens After Phase 1?

### If Go → Phase 2 (MVP Package)
- **Duration:** 6-8 weeks
- **Resources:** 1-2 engineers
- **Deliverables:** 
  - Publish `@vertz/canvas@0.1.0-alpha` to npm
  - 10+ examples (data viz, games, interactive demos)
  - Full documentation
  - TypeScript support
- **Goal:** Usable for real projects (alpha users)

### If No-Go → Lessons Learned
- Document why it didn't work
- Share findings with community (blog post?)
- Move on (no regrets, validated cheaply)

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| PixiJS breaks/changes | High | Low | Pin version, abstract behind vertz API |
| Bundle size kills adoption | Medium | Medium | Opt-in package, tree-shaking, document clearly |
| Performance isn't better than DOM | High | Low | Validate early (Phase 1), kill if not |
| Team burnout / scope creep | High | Medium | Strict phase gates, time-box, willing to kill |
| Market doesn't care | High | Low-Med | Validate demand, build for real use cases |

**Low-risk bet:** 3 weeks, 1 engineer, clear kill criteria.

---

## Competitive Landscape

**Existing solutions:**
- **react-konva:** React + Canvas2D (slower than WebGL)
- **React Three Fiber:** React + Three.js (3D, not 2D)
- **Figma:** Custom C++ renderer (years of work, specialized)
- **PixiJS directly:** Imperative API (not declarative)

**Vertz Canvas advantage:**
- Fine-grained reactivity (better than React's reconciliation)
- Declarative JSX (better than imperative PixiJS)
- Hybrid approach (DOM + Canvas, pragmatic)

**Target users:**
- Data viz developers (real-time dashboards)
- Design tool builders (Figma alternatives)
- Game developers (2D games, interactive experiences)
- Creative coders (generative art, visualizations)

**Not for:** General web apps. DOM is still the default.

---

## Budget Impact

### Phase 1 (POC)
- **Time:** 2-3 weeks
- **Cost:** ~0.5 engineer-months (kai @ 100%, edson @ 25%)
- **Opportunity cost:** What else could kai build? (Probably: vertz core features)

### Phase 2 (MVP, if approved)
- **Time:** 6-8 weeks
- **Cost:** ~1.5-2 engineer-months
- **Dependencies:** None (opt-in package, no core changes)

### Phase 3 (Production, future)
- **Time:** 3-4 months
- **Cost:** ~4-6 engineer-months
- **Requires:** Phase 2 validation (real projects using it)

**Total investment (to production):** ~6-8 engineer-months IF we go all the way.

**Sunk cost if we kill after Phase 1:** 0.5 engineer-months. **Acceptable.**

---

## Recommendation

**Approve Phase 1 (Proof of Concept).**

**Why:**
- Low risk (3 weeks, 1 engineer, clear kill criteria)
- High potential upside (differentiated feature for high-value use cases)
- Validates quickly (fail fast if it doesn't work)
- Leverages existing research (josh's deep dive)
- Aligns with vertz's strengths (fine-grained reactivity, compiler)

**Next steps if approved:**
1. kai starts Spike 01 this week (100 animated sprites)
2. Team reviews progress weekly
3. Go/No-Go decision by Mar 7 (end of Phase 1)
4. If Go: plan Phase 2 timeline and resources
5. If No-Go: document learnings, move on

**Approval needed:**
- [ ] Mike (VP Eng): Approve Phase 1 timeline and resources
- [ ] Budget: 0.5 engineer-months allocated to Canvas Squad

---

## Questions?

**riley (PM) is available to discuss.**

- Slack: @riley
- Email: riley@vertz.dev
- Office hours: Daily, 2-3 PM UTC

---

**TL;DR:** We want 3 weeks to prove PixiJS + vertz signals is awesome. If it works, we build it. If not, we kill it. Low risk, high potential.

**Decision needed:** ✅ Approve Phase 1 or ❌ Pass (and why)?

— riley
