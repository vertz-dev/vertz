# Canvas Squad Roadmap 🎨

**Last Updated:** 2026-02-14  
**Owner:** riley (Product Manager)  
**Status:** Ready to Execute

---

## Vision

Enable vertz developers to use WebGL/Canvas rendering for performance-critical UI zones while keeping the DOM for everything else. Declarative JSX + fine-grained reactivity + battle-tested PixiJS renderer = best-in-class DX for data viz, design tools, and interactive experiences.

**Not trying to:** Replace the DOM. Canvas is a tool, not a religion.

**Trying to:** Make Canvas rendering feel native to vertz — simple, reactive, composable.

---

## Strategy: Build vs. Buy

**Decision:** Wrap PixiJS, don't build a renderer from scratch.

**Rationale (from Josh's research):**
- PixiJS is mature (10+ years), battle-tested, actively maintained
- Solves hard problems: text rendering, events, asset loading, WebGL optimization
- ~460KB bundle is acceptable for target use cases (data viz, design tools, games)
- Saves 1-2 years of development vs. custom WebGL renderer
- Vertz focuses on its unique value: signals + compiler, not "how to draw a circle"

**Trade-off:** External dependency, but proven pattern (React Three Fiber uses Three.js).

---

## Phases & Timeline

### Phase 0: Research & Validation (CURRENT)
**Duration:** 1 week  
**Status:** ✅ Complete  
**Owner:** josh

**Deliverables:**
- [x] Prior art research (Figma, Flutter, PixiJS, Konva)
- [x] Technical feasibility analysis
- [x] Architecture recommendation (hybrid + PixiJS)
- [x] Hard problems identified (text, accessibility, layout)

**Outcome:** Hybrid approach with PixiJS validated. Roadmap defined. Ready to prototype.

---

### Phase 1: Proof of Concept (Spike)
**Duration:** 2-3 weeks  
**Owner:** kai (Graphics Lead)  
**Supporting:** edson (platform integration), josh (API design)

#### Goal
Validate that **vertz signals + PixiJS = smooth, performant, and feels good to use**.

#### Scope
Build the minimal `@vertz/canvas` package:

**Core Primitives:**
- `<Canvas>` — root component (creates PixiJS Application)
- `<Sprite>` — image rendering (PIXI.Sprite)
- `<Container>` — grouping/transforms (PIXI.Container)
- `<Text>` — text rendering (PIXI.Text, Canvas2D fallback)
- `<Graphics>` — vector shapes (PIXI.Graphics)

**Reactivity:**
- Wire vertz signals to PixiJS property updates
- `effect(() => { sprite.x = x(); })` pattern
- Ensure no janky rendering, validate 60fps at scale

**Events:**
- Basic interactivity: `onClick`, `onPointerMove`, `onPointerEnter`
- Map PixiJS events to vertz event system

**Example Demo:**
Build ONE compelling demo that shows off the approach:
- Real-time animated chart (100+ data points updating every frame)
- OR interactive sprite game (draggable objects, collision detection)
- OR particle system (1000+ particles, smooth 60fps)

**NOT in scope (Phase 1):**
- ❌ Layout engine (manual x/y positioning only)
- ❌ Accessibility layer
- ❌ Asset loading (use direct URLs)
- ❌ DevTools
- ❌ Documentation
- ❌ TypeScript definitions (use `any` for now)

#### First Spike (Week 1)

**What kai builds:**

**Goal:** Simplest possible signal → Canvas rendering proof.

**Task:** Create a Canvas with 100 animated sprites driven by signals.

**Acceptance criteria:**
1. `<Canvas>` component renders PixiJS app to a DOM canvas element
2. `<Sprite x={signal.x} y={signal.y} texture="bunny.png" />` creates a PIXI.Sprite
3. When signal changes, sprite position updates WITHOUT full re-render
4. 100 sprites animating at 60fps (use `useTicker` hook for animation loop)
5. Code feels "vertz-like" — declarative JSX, signals work naturally

**Files to create:**
```
packages/canvas/
├── src/
│   ├── components/
│   │   ├── Canvas.tsx          # Root component
│   │   ├── Sprite.tsx          # Basic sprite
│   │   └── Container.tsx       # Grouping
│   ├── hooks/
│   │   └── useTicker.ts        # Animation loop hook
│   ├── runtime/
│   │   ├── create-pixi-app.ts  # PixiJS initialization
│   │   └── signal-binding.ts   # Wire signals to PixiJS props
│   └── index.ts
├── examples/
│   └── animated-sprites/
│       └── index.tsx           # The demo
├── package.json
└── tsconfig.json
```

**Estimated effort:** 3-5 days (if PixiJS integration is smooth).

**Success looks like:**
- kai shares a screen recording: 100 bunnies bouncing around smoothly
- Code review shows clean signal bindings (no hacks or workarounds)
- Performance metrics: 60fps on mid-range laptop

**Failure looks like:**
- Signals don't update PixiJS cleanly (need workarounds)
- Performance is janky (dropped frames, stuttering)
- API feels bolted-on (not natural vertz syntax)

**If it fails:** Pause, reassess. Maybe PixiJS isn't the right backend. Maybe Canvas rendering isn't viable for vertz. **Don't push forward without validation.**

#### Deliverables (End of Phase 1)

**Code:**
- `@vertz/canvas` package (alpha, not published)
- 1-2 working examples (animated sprites + one other)
- Basic test coverage (signals → PixiJS updates work correctly)

**Documentation:**
- Internal README: how to run examples
- API sketch: proposed component surface area
- Performance report: FPS, memory usage, bundle size

**Decision Artifact:**
- **Go/No-Go Document** (riley writes this after reviewing kai's work)
  - Does the API feel good?
  - Is performance acceptable?
  - Are there blockers we didn't anticipate?
  - Should we invest in Phase 2 (MVP)?

**Acceptance Criteria:**
- [ ] 100+ animated objects render at 60fps
- [ ] Signals update PixiJS properties without full reconciliation
- [ ] API feels vertz-native (not awkward wrapper)
- [ ] Click/hover events work smoothly
- [ ] Bundle size < 500KB (PixiJS + wrapper)
- [ ] Code is clean enough to show to CTO without embarrassment

**Exit Criteria (Go to Phase 2):**
- ✅ All acceptance criteria met
- ✅ Team consensus: "This feels good, let's build the real thing"
- ✅ No major architectural blockers discovered

**Exit Criteria (No-Go, pause or pivot):**
- ❌ Performance is worse than DOM for the use case
- ❌ API is too awkward (doesn't feel like vertz)
- ❌ PixiJS integration is too fragile (hacks everywhere)

---

### Phase 2: MVP Package
**Duration:** 6-8 weeks  
**Owner:** kai (implementation), edson (packaging/build), josh (docs/DX)  
**Start date:** TBD (after Phase 1 Go decision)

#### Goal
Ship `@vertz/canvas@0.1.0` — usable for real projects, published to npm (alpha tag).

#### Scope

**Full PixiJS Primitive Coverage:**
- All basic display objects: Sprite, Container, Graphics, Text, Mesh
- AnimatedSprite (sprite sheets, frame-based animation)
- TilingSprite (repeating textures)
- NineSlicePlane (scalable UI elements)

**Asset Management:**
- `useAssets()` hook — load images, fonts, spritesheets
- Async loading with loading states
- Texture caching (don't reload same asset twice)

**Animation & Timing:**
- `useTicker(callback)` — animation loop hook
- Tween/animation helpers (simple lerp, easing functions)
- Delta time support (frame-independent animation)

**Events:**
- Full event coverage: click, hover, drag, touch
- Event bubbling through Container hierarchy
- Custom event handlers

**Layout (Manual):**
- x, y, width, height positioning
- Anchors, pivots, transforms
- No automatic layout yet (that's Phase 3)

**Developer Experience:**
- TypeScript definitions (full type safety)
- JSDoc comments on all public APIs
- 5-10 working examples:
  1. Animated sprite game
  2. Real-time line chart
  3. Interactive particle system
  4. Draggable UI elements
  5. Image filters/effects
  6. (+ 3-5 more showcasing different features)

**Documentation:**
- Getting started guide
- API reference (all components + hooks)
- Migration guide: "When to use Canvas vs. DOM"
- Performance best practices
- Troubleshooting common issues

**Testing:**
- Unit tests for signal bindings
- Integration tests for component lifecycle
- Visual regression tests (snapshot Canvas output)
- Performance benchmarks (track regressions)

**Build & Packaging:**
- ESM + CJS builds
- Tree-shakeable exports
- Source maps for debugging
- Bundle size report (CI check, fail if >500KB)

**NOT in scope (Phase 2):**
- ❌ Layout engine (Yoga/Taffy) — still manual positioning
- ❌ Accessibility layer (semantic DOM sync)
- ❌ DevTools (Canvas inspector)
- ❌ Server-side rendering
- ❌ 3D support (Three.js integration — different package)

#### Deliverables

- `@vertz/canvas@0.1.0-alpha` published to npm
- 10+ working examples (runnable locally + deployed demos)
- Full documentation site (subdomain: canvas.vertz.dev or vertz.dev/canvas)
- Performance benchmarks (vs. DOM, vs. react-konva)
- Blog post: "Introducing Vertz Canvas" (announce to community)

#### Acceptance Criteria

- [ ] All PixiJS primitives wrapped and tested
- [ ] 10+ examples demonstrating different use cases
- [ ] TypeScript support (types work in VSCode)
- [ ] Documentation site live (getting started + API reference)
- [ ] Bundle size ≤ 500KB (minified + gzipped)
- [ ] Test coverage ≥ 80% (signal bindings, lifecycle)
- [ ] 5+ external developers test it (feedback collected)
- [ ] Performance benchmarks show Canvas beats DOM for target use cases
- [ ] Mike (VP Eng) approves for alpha release

**Success Metrics (post-launch):**
- 3+ real projects adopt it within 3 months
- GitHub issues are feature requests, not bug reports
- Positive feedback on API design (DX is good)

---

### Phase 3: Production-Ready (Future)
**Duration:** 3-4 months  
**Owner:** TBD  
**Start date:** TBD (after Phase 2 validation)

**This phase only happens if Phase 2 proves valuable.**

#### Scope

**Layout Engine:**
- Integrate Yoga (Flexbox via WASM) or Taffy (Flexbox + Grid)
- `<Flex>`, `<Grid>` components for automatic layout
- Responsive layout (resize handling)
- ~200KB bundle increase (acceptable for users who need layout)

**Accessibility Layer:**
- Semantic DOM sync (hidden DOM tree mirrors Canvas)
- ARIA labels, roles, live regions
- Keyboard navigation support
- Screen reader testing (NVDA, JAWS, VoiceOver)
- WCAG 2.1 AA compliance (where feasible)

**DevTools:**
- `@vertz/canvas-devtools` Chrome extension
- Canvas inspector: click to select object, view properties
- Scene graph viewer (tree structure)
- Performance profiler (FPS, draw calls, texture memory)
- Signal dependency graph

**Advanced Features:**
- Filters/effects (blur, glow, color matrix)
- Masking & clipping
- Blend modes
- Post-processing shaders
- WebGPU support (PixiJS v8 already supports it)

**Documentation & Education:**
- Video tutorials (YouTube series)
- Interactive playground (try code in browser)
- Case studies (real projects using vertz Canvas)
- Migration guide (react-konva → vertz Canvas)

**Ecosystem:**
- Component library (`@vertz/canvas-ui` — pre-built Chart, Button, Slider components)
- Integrations: D3.js bridge, game engine helpers
- Community showcase (gallery of projects)

#### Deliverables

- `@vertz/canvas@1.0.0` (stable release)
- Full layout engine support
- Accessibility layer (hybrid approach)
- DevTools extension
- 50+ examples and templates
- Video course / tutorial series
- Community-driven component library

#### Acceptance Criteria

- [ ] Layout engine works (Flexbox, Grid)
- [ ] Accessibility passes WCAG 2.1 AA audit
- [ ] DevTools extension published to Chrome Web Store
- [ ] 20+ production projects using it
- [ ] Featured in conferences / blog posts
- [ ] CTO approves for public presentation

**Success Metrics:**
- 100+ GitHub stars
- 1,000+ npm downloads/month
- Positive case studies (performance wins, developer satisfaction)
- Recognized as best-in-class for Canvas + reactivity

---

## Key Risks & Mitigations

### Risk 1: PixiJS Breaks or Changes
**Impact:** High (we depend on external library)  
**Likelihood:** Low (PixiJS is stable, mature)  
**Mitigation:**
- Pin PixiJS version, test before upgrading
- Abstract PixiJS behind vertz API (insulate from changes)
- Build relationship with PixiJS maintainers (contribute back)

### Risk 2: Bundle Size Kills Adoption
**Impact:** Medium (460KB might be too large)  
**Likelihood:** Medium (but acceptable for target users)  
**Mitigation:**
- Make `@vertz/canvas` fully opt-in (not in core framework)
- Provide "minimal" build (tree-shake unused PixiJS features)
- Document bundle size clearly, set expectations
- Target high-value use cases where size is acceptable (data viz, games)

### Risk 3: Accessibility Lawsuit
**Impact:** High (legal liability)  
**Likelihood:** Medium (if used improperly)  
**Mitigation:**
- Phase 3 includes semantic DOM layer
- Document accessibility limitations clearly
- Recommend hybrid approach (DOM for UI, Canvas for viz)
- Don't position Canvas as DOM replacement

### Risk 4: Team Burnout / Scope Creep
**Impact:** High (morale, velocity)  
**Likelihood:** Medium (this is a big project)  
**Mitigation:**
- Strict phase gates — don't start Phase 2 without Phase 1 success
- Time-box phases (if Phase 2 drags past 10 weeks, reassess)
- Kill it if it's not working (sunk cost fallacy is real)
- Celebrate small wins (demo days after each phase)

### Risk 5: Market Doesn't Care
**Impact:** High (wasted effort)  
**Likelihood:** Low-Medium (data viz is a real need)  
**Mitigation:**
- Validate demand early (Phase 1 feedback from potential users)
- Build examples for real use cases (not toy demos)
- Talk to users: "Would you use this? What's missing?"
- Pivot or kill if adoption is low after Phase 2

---

## Success Criteria (Overall)

**Phase 1 Success:**
- Proof of concept works, feels good, performs well
- Team consensus: "Let's build this for real"

**Phase 2 Success:**
- 5+ external projects adopt `@vertz/canvas@0.1.0-alpha`
- Positive feedback on DX (API is intuitive)
- Performance benchmarks validate Canvas approach

**Phase 3 Success:**
- Production deployments (data viz dashboards, design tools)
- Accessibility compliant
- Featured in blog posts, conference talks
- CTO presents to investors / customers

**Exit Criteria (Kill the project):**
- Phase 1 POC fails validation (performance, DX, or technical blockers)
- Phase 2 adoption is low (<3 projects after 6 months)
- Team consensus: "This isn't worth continuing"

---

## Team Responsibilities

### riley (Product Manager, YOU)
- **Phase 0-1:** Define roadmap, write acceptance criteria, coordinate team
- **Phase 1:** Review kai's POC, write Go/No-Go decision doc
- **Phase 2:** Gather user feedback, prioritize features, write launch blog post
- **Phase 3:** Partner with marketing, case studies, community building

### kai (Graphics Lead)
- **Phase 1:** Build POC (spike), validate PixiJS integration
- **Phase 2:** Implement all PixiJS primitives, optimize performance
- **Phase 3:** Advanced features (filters, shaders, WebGPU)

### edson (Platform Engineer)
- **Phase 1:** Build system setup, packaging structure
- **Phase 2:** Build pipeline, bundle optimization, CI/CD
- **Phase 3:** DevTools extension, performance profiling

### josh (Research/DX, shared)
- **Phase 0:** Prior art research ✅ (DONE)
- **Phase 1:** API design, review kai's code
- **Phase 2:** Documentation, examples, getting started guide
- **Phase 3:** Video tutorials, interactive playground

---

## Communication & Checkpoints

### Daily (Phase 1 only)
- Quick async updates in team channel (Canvas Squad)
- Blockers surfaced immediately

### Weekly (All phases)
- Demo: show progress (even if broken)
- Retrospective: what's working, what's not
- Plan next week's work

### Phase Gates
- **End of Phase 1:** Go/No-Go meeting (riley leads)
  - Review: code, demo, performance, DX
  - Decision: continue to Phase 2, pivot, or kill
  - If Go: get Mike's approval, allocate Phase 2 resources

- **End of Phase 2:** Launch Readiness Review
  - Review: package quality, docs, examples
  - Decision: publish alpha, iterate, or pause
  - If Go: announce to community, gather feedback

- **End of Phase 3:** Production Readiness Review
  - Review: stability, accessibility, DevTools
  - Decision: promote to stable (1.0), continue beta, or sunset
  - If Go: CTO presents to broader audience

### Mike (VP Eng) Check-ins
- Weekly heartbeat: "How's Canvas Squad doing?"
- Phase gate meetings (mandatory attendance)
- Escalate to CTO only when:
  - Requesting budget (beyond squad capacity)
  - Strategic decision (e.g., kill the project)
  - Ready to present externally (demos, blog posts)

---

## Next Steps (Immediate)

**This week (riley):**
- [x] Write this roadmap ✅
- [ ] Share with team (kai, edson, josh)
- [ ] Get Mike's approval for Phase 1 timeline
- [ ] Create GitHub project board (track Phase 1 tasks)

**Next week (kai):**
- [ ] Set up `@vertz/canvas` package structure
- [ ] Spike: 100 animated sprites with signals
- [ ] Report back: does it feel good? any blockers?

**Week 3 (team):**
- [ ] Code review: kai's POC
- [ ] Build 1-2 more examples (chart or game)
- [ ] Performance benchmarks
- [ ] Go/No-Go decision meeting

---

## Appendix: Architecture Sketch

### How Signals Wire to PixiJS

```tsx
// Developer writes this
<Sprite x={x()} y={100} texture="bunny.png" rotation={rotation()} />

// Vertz generates this (conceptual)
const sprite = new PIXI.Sprite(PIXI.Texture.from('bunny.png'));
sprite.y = 100; // Static prop, set once

// Dynamic props → effects
effect(() => { sprite.x = x(); });
effect(() => { sprite.rotation = rotation(); });

// Cleanup on unmount
onCleanup(() => { sprite.destroy(); });
```

**Key insight:** Vertz's fine-grained reactivity is PERFECT for this. Each dynamic prop gets its own effect. When signal changes, only that property updates. No reconciliation, no diffing.

### Component Hierarchy

```tsx
<Canvas>              {/* PIXI.Application */}
  <Container>         {/* PIXI.Container */}
    <Sprite />        {/* PIXI.Sprite */}
    <Graphics />      {/* PIXI.Graphics */}
  </Container>
  <Text />            {/* PIXI.Text */}
</Canvas>
```

Maps 1:1 to PixiJS scene graph. Simple, predictable.

### Event Flow

```tsx
<Sprite
  interactive
  onClick={(e) => console.log('clicked', e.global.x, e.global.y)}
/>
```

PixiJS events → vertz event handlers. Bubble up Container hierarchy (like DOM).

---

## Closing Thoughts

This roadmap is ambitious but grounded. Phase 1 is low-risk (2-3 weeks, one engineer). If it works, great—move to Phase 2. If not, we learned something and didn't waste months.

The key is **not falling in love with the idea**. Canvas rendering is cool, but it's only valuable if it solves real problems. Validate early, validate often, and be willing to kill it if it's not working.

Josh's research is solid. PixiJS is the right choice. Now it's kai's turn to prove the concept works in practice.

**Let's build something great. Or learn why we shouldn't. Either outcome is valuable.**

— riley

---

**Last updated:** 2026-02-14  
**Next review:** After Phase 1 completion (target: early March 2026)
