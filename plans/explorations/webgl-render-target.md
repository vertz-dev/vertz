# WebGL/Canvas Render Target Feasibility Study

**Date:** 2026-02-14  
**Author:** josh  
**Status:** Research  

## Executive Summary

**The Vision:** Write normal vertz JSX components, opt into WebGL rendering for performance-critical parts. Same component model, compiler handles the output switch.

**TL;DR:** Technically feasible but extraordinarily difficult. The hard problems (text, accessibility, layout) are 80% of the work. Could be a competitive advantage for specific use cases (data viz, design tools, games) but would be a distraction from core framework goals for general UI. A hybrid approach (DOM + WebGL overlay) is the most pragmatic path forward.

**Recommendation:** Prototype the hybrid approach (Option C) in 3-6 months for specific use cases. Avoid attempting a full Canvas-only renderer unless vertz pivots to target design tools or data visualization as primary market.

---

## 1. Prior Art — Who's Done This?

**📚 See Also:** [Deep Dive on Prior Art & PixiJS Integration](./webgl-prior-art-deep-dive.md) — comprehensive research on leveraging existing rendering engines instead of building from scratch.

---

### Flutter Web (Skia/CanvasKit)

**What they did:**
- Flutter renders to Skia (C++ graphics engine) on native platforms
- For web: CanvasKit (Skia compiled to WebAssembly) renders to Canvas/WebGL
- Alternative "HTML renderer" uses DOM for better compatibility/smaller bundle

**Key learnings:**
- **Bundle size pain:** CanvasKit is ~2MB compressed. Deal-breaker for content sites.
- **Text rendering:** Years of work. Font loading, shaping, ligatures, emoji, RTL—all manual.
- **Accessibility:** Semantic layer sits *on top* of Canvas. Shadow DOM tree mirrors canvas content. Complex to maintain sync.
- **Performance:** Actually slower than DOM for typical UI. Canvas shines for animations/graphics, not scrolling lists.
- **Platform gap:** iOS Safari historically had poor Canvas performance. Getting better but still inconsistent.

**Verdict:** Successful for apps that need pixel-perfect cross-platform rendering. Overkill for web-first frameworks.

---

### Figma (C++/WebAssembly → Canvas2D/WebGL)

**What they did:**
- Design tool with 60fps canvas manipulation
- C++ rendering engine compiled to WebAssembly
- Custom text layout engine, custom font rasterization
- Multi-threaded with Web Workers

**Key learnings:**
- **Specialized domain:** Justified for a design tool where pixel-perfect matters
- **Text rendering:** Took years, full-time team. HarfBuzz for shaping, FreeType for rasterization
- **Hit testing:** Custom spatial indexing (R-trees) for click detection
- **Accessibility:** Minimal. Design tools get a pass; user-facing apps don't
- **Startup cost:** Initial load is heavy. Amortized over long sessions

**Verdict:** Success story, but they're building AutoCAD for UI. Not comparable to general web apps.

---

### React Three Fiber (React → Three.js/WebGL)

**What they did:**
- Custom React reconciler targeting Three.js scene graph instead of DOM
- JSX describes 3D objects: `<mesh>`, `<boxGeometry>`, etc.
- React handles component lifecycle, R3F updates Three.js imperatively

**Key learnings:**
- **Reconciler is powerful:** `react-reconciler` lets you target anything with a tree structure
- **Declarative wrapper over imperative library:** Nice dev experience for 3D
- **Not a general UI:** No text layout, no forms, no accessibility. 3D content only
- **Hybrid by necessity:** DOM UI overlays 3D canvas for controls/HUD

**Relevance to vertz:**
- Proof that custom renderers work for specialized content
- Shows hybrid (DOM + canvas) is the real-world solution
- SolidJS has similar pattern with `solid-three`

**Verdict:** Great for 3D, not a model for general UI rendering.

---

### React's Reconciler API (react-reconciler)

**What it enables:**
- React Native, React Three Fiber, Ink (CLI renderer), react-pdf—all use this
- Framework handles component lifecycle, you implement platform primitives
- Must implement: `createInstance`, `appendChild`, `commitUpdate`, etc.

**Challenges:**
- **Not trivial:** Requires deep understanding of reconciliation
- **You own everything:** Layout, events, text, accessibility—all manual
- **Virtual DOM overhead:** Diffing still happens even if target is efficient

**Relevance to vertz:**
- Vertz has fine-grained reactivity (signals), no virtual DOM
- Don't need a reconciler—updates are already surgical
- Could compile JSX directly to imperative Canvas calls

**Verdict:** React's reconciler is more overhead than vertz needs. Vertz's compiler is a better starting point.

---

### SolidJS Custom Renderers

**What they did:**
- `solid-three` for Three.js
- Universal renderer API lets you target custom backends
- Fine-grained reactivity means only changed properties update

**Key learnings:**
- **Signals are ideal for Canvas:** No diffing, direct updates to draw calls
- **Simpler than React reconciler:** Less machinery, more direct
- **Still requires platform primitives:** Someone has to implement layout, text, etc.

**Relevance to vertz:**
- Closest model to what vertz could do
- Vertz's reactivity system + compiler could be even more direct
- But still doesn't solve hard problems (text, layout, a11y)

**Verdict:** Architecturally closest match. Doesn't dodge the hard problems.

---

### Other Notable Examples

**Doodle (Kotlin/Multiplatform → Canvas)**
- UI framework rendering to Canvas
- Custom layout engine, text rendering, accessibility layer
- Niche adoption—proves general Canvas UI is hard to sell

**Servo/WebRender (Firefox)**
- GPU-accelerated DOM rendering
- Browsers already optimize this—why reinvent?

**Game engines (Phaser, PixiJS)**
- Canvas/WebGL for games and graphics
- Zero attempt at general UI (no forms, text input, accessibility)

---

## 2. Architecture Options

### Option A: Custom Renderer at Runtime (React Three Fiber style)

**How it works:**
- Vertz components run normally, reactivity system tracks dependencies
- Instead of updating DOM, updates call WebGL/Canvas drawing functions
- VNode tree maps to a scene graph or render command buffer

**Pros:**
- Familiar reconciler pattern
- Reactivity already surgical—no vdom diffing overhead
- Could reuse existing vertz component model

**Cons:**
- Runtime overhead—every update goes through renderer
- Still need to solve all hard problems (layout, text, a11y)
- Larger bundle (renderer + layout engine + text engine)

**Verdict:** Feasible but heavyweight. Better for SPA/app scenarios than content sites.

---

### Option B: Compile JSX to WebGL Calls at Build Time

**How it works:**
- Compiler transforms JSX to imperative Canvas/WebGL calls
- No runtime renderer—just drawing code
- Signals wire directly to Canvas updates

**Example (conceptual):**
```jsx
<Canvas>
  <Rect x={signal.x} y={10} width={100} height={50} fill="blue" />
</Canvas>
```

Compiles to:
```js
effect(() => {
  ctx.fillStyle = 'blue';
  ctx.fillRect(signal.x, 10, 100, 50);
});
```

**Pros:**
- Minimal runtime overhead
- Leverages vertz's compiler strength
- Could generate optimized batched draw calls

**Cons:**
- Less flexible—harder to compose/abstract
- Still need layout engine (where does `x`, `y` come from?)
- Text rendering still manual
- Debugging harder (no runtime inspection)

**Verdict:** Interesting for constrained scenarios (data viz, canvas-only widgets) but doesn't scale to full UIs.

---

### Option C: Hybrid — DOM for Layout/Text, WebGL Overlay for Hot Zones

**How it works:**
- Normal vertz components render to DOM (text, forms, layout)
- Special `<Canvas>` or `<WebGL>` component for performance-critical zones
- DOM handles accessibility, text, input—Canvas handles animations, visualizations
- Positioned overlays or side-by-side

**Example:**
```jsx
<div class="dashboard">
  <header>My App</header>
  <Canvas class="chart">
    <DataViz data={signal.data} />
  </Canvas>
  <footer>Status: {signal.status}</footer>
</div>
```

**Pros:**
- **Practical:** Solves real problems without reinventing the wheel
- **Incremental adoption:** Use Canvas where it helps, DOM everywhere else
- **Accessibility:** DOM handles it naturally
- **Text:** Browser does it
- **Layout:** CSS does it
- **Best of both worlds:** DOM for structure, Canvas for performance

**Cons:**
- Not "pure"—can't render *everything* to Canvas
- Overlay positioning can be tricky
- Two rendering pipelines to maintain

**Verdict:** This is the winner. Pragmatic, solves real use cases, doesn't over-reach.

---

### Option D: WebGPU Instead of WebGL

**Why WebGPU?**
- Next-gen graphics API, better performance, more modern
- Lower-level than WebGL—more control, closer to Metal/Vulkan
- Better compute shader support (useful for complex layouts?)

**Reality check:**
- **Browser support:** Still experimental in 2026. Safari lagging.
- **Complexity:** Even harder than WebGL
- **Not a panacea:** Same hard problems (text, layout, a11y)
- **Bundle size:** Larger runtime for GPU abstraction

**Verdict:** Too early. Revisit in 2-3 years if Canvas rendering becomes core strategy.

---

## 3. What Vertz Already Has That Helps

### ✅ Fine-Grained Reactivity (Signals)

**Why it matters:**
- No virtual DOM diffing—updates are surgical
- Signal changes can map directly to Canvas draw calls
- Example: `ctx.fillRect(x(), y(), w(), h())` re-runs only when signals change
- **This is a massive advantage over React.** No reconciliation overhead.

**Concrete benefit:**
- React Three Fiber has reconciler cost even though Three.js is efficient
- Vertz can skip straight to "draw what changed"

---

### ✅ Compiler Step

**Why it matters:**
- Can transform JSX to anything at build time
- Could generate optimized Canvas code instead of DOM nodes
- Dead code elimination—only include what you use (WebGL code only if you use Canvas components)

**Concrete benefit:**
- Option B (compile to Canvas calls) is uniquely viable because of this
- Could detect static vs dynamic properties and optimize accordingly

---

### ✅ VNode Abstraction in `@vertz/ui-server`

**Why it matters:**
- Already has a layer between JSX and output
- Server rendering proves vertz isn't tied to DOM
- Could add "canvas" as a render target alongside "html" and "server"

**Concrete benefit:**
- Architecture already supports multiple backends
- Adding Canvas target is extension, not rewrite

**But:**
- Layout is currently assumed to be CSS/browser
- Would need layout engine for Canvas target

---

### ✅ Small, Modular Design

**Why it matters:**
- Can add Canvas rendering as opt-in package (`@vertz/canvas`?)
- Doesn't bloat core framework
- Users pay cost only if they use it

**Concrete benefit:**
- Hybrid approach (Option C) fits vertz's philosophy
- Progressive enhancement: DOM by default, Canvas where needed

---

## 4. Hard Problems

These aren't "challenges"—they're **multi-year engineering efforts**.

### 🔴 Text Rendering (The Hardest Problem)

**Why it's hard:**
- **Font loading:** Browser does this automatically. Canvas doesn't.
- **Text shaping:** Ligatures, kerning, combining marks, emoji. HarfBuzz is 500k+ LOC.
- **Bidirectional text:** RTL languages, mixed directionality. Unicode BiDi algorithm is complex.
- **Line breaking:** Word wrap, hyphenation, CJK rules. Not trivial.
- **Text measurement:** `measureText()` exists but is limited. Doesn't give per-glyph metrics.
- **Subpixel rendering:** Browser does this for crisp text. Canvas text is blurrier.
- **Emoji:** Fallback fonts, color emoji vs outline, regional indicators. Nightmare.

**What Figma did:**
- Ported HarfBuzz (text shaping) to WebAssembly
- Custom font rasterizer
- Multi-year effort, dedicated team

**What Flutter did:**
- Uses Skia's text engine (also years of work)
- Still doesn't match browser quality for all edge cases

**Options for vertz:**
1. **Punt to DOM:** Render text as DOM overlays. Hybrid approach.
2. **Use Canvas 2D text:** `ctx.fillText()`—works but limited. No rich layout.
3. **WebAssembly text engine:** Multi-year project. Not realistic for vertz.

**Realistic verdict:** Text is a dealbreaker for general UI. Hybrid (DOM text, Canvas graphics) is the only pragmatic path.

---

### 🔴 Accessibility (Screen Readers Can't See Canvas)

**The problem:**
- Canvas is pixels. Screen readers need semantic structure.
- Must maintain parallel DOM tree with ARIA labels
- Sync is fragile—easy to drift out of date

**What Flutter did:**
- "SemanticsNode" tree mirrors rendering tree
- Generates hidden DOM elements for screen reader
- Complex to maintain, incomplete coverage

**What Figma did:**
- Minimal accessibility. Design tools are editor-heavy, less user-facing.
- Not acceptable for general web apps.

**Regulatory reality:**
- ADA compliance, WCAG 2.1—required for many orgs
- Canvas-only UIs are accessibility lawsuits waiting to happen

**Options for vertz:**
1. **Hybrid approach:** DOM handles accessible content, Canvas for enhancements
2. **Shadow DOM sync:** Generate hidden DOM tree. High maintenance.
3. **Accept limitations:** Document that Canvas mode is not accessible. Niche adoption.

**Realistic verdict:** Accessibility is table stakes for general UIs. Another point for hybrid approach.

---

### 🔴 CSS Layout Engine

**The problem:**
- Flexbox, Grid, positioning, box model—all gone
- Need manual layout engine

**Options:**
1. **Port a layout engine:**
   - **Yoga:** Facebook's Flexbox implementation (C++, can compile to Wasm)
   - **Taffy:** Rust layout engine (Flexbox + Grid, smaller than Yoga)
   - Both are ~100-200KB additional bundle
2. **Implement subset:** Only support basic box model + flex
3. **Manual positioning:** Users specify x, y, width, height. Like Swing/WinForms.

**Reality check:**
- Full CSS layout is massive (see browser engine complexity)
- Subset is doable but still large effort
- Manual positioning works for games/data viz, not general UI

**Realistic verdict:** Layout engine is months of work. Yoga/Taffy are viable but add bundle size.

---

### 🔴 Input Handling & Hit Testing

**The problem:**
- DOM gives you events on elements for free
- Canvas is one big element—must manually determine what was clicked

**Requirements:**
- Mouse/touch coordinate → which component?
- Hover states, focus management, tab order
- Event bubbling, capture phase
- Drag and drop

**Solutions:**
- **Spatial indexing:** R-trees, quadtrees for efficient lookup
- **Bounding box checks:** Simple for rectangles, complex for paths/curves
- **Repaint on hover:** Need to track hover state, redraw

**Effort:** Weeks for basic, months for robust.

**Realistic verdict:** Doable but tedious. Every UI framework has solved this.

---

### 🔴 Developer Tooling

**The problem:**
- No DOM inspector for Canvas content
- Can't right-click → inspect element
- Debugging is console.log-driven

**What Flutter did:**
- Custom DevTools extension
- Shows widget tree, property inspector
- Required significant investment

**Options for vertz:**
1. **Build custom DevTools:** Chrome extension showing Canvas scene graph
2. **Overlay debug UI:** DOM panel showing Canvas state
3. **Accept poor DX:** Console logging and breakpoints

**Realistic verdict:** Debugging Canvas UIs is painful. Would need tooling investment to be viable.

---

## 5. Mobile Angle

### Is Canvas/WebGL Actually Faster on Mobile?

**Conventional wisdom:** Canvas is faster for complex animations.

**Reality:**
- **For typical UI:** DOM is often faster. Browsers are extremely optimized.
- **For heavy graphics:** Canvas wins (games, data viz, design tools)
- **iOS Safari:** Historically slow Canvas. Better in recent years but still inconsistent.
- **Android Chrome:** Generally good Canvas performance.

**Benchmarks (circa 2025-2026):**
- Scrolling a list of 1000 items: DOM wins (virtual scrolling + GPU-accelerated compositing)
- Animating 1000 particles: Canvas wins (batch draw calls)
- Complex SVG interactions: Canvas wins (can optimize draw calls)
- Form-heavy UI: DOM wins (native controls, keyboard handling)

**Verdict:** Canvas is not a silver bullet for mobile performance.

---

### Path to Native-Like Performance Without React Native?

**The dream:**
- Write once, deploy to web + mobile
- Canvas rendering gives native-like performance
- Avoid React Native's bridge overhead

**Reality check:**
- **React Native's slowness** is mostly the JS ↔ native bridge, not rendering
- **Canvas doesn't solve this:** Still JavaScript, still WebView
- **Capacitor + DOM** is already fast for most apps
- **True native performance** requires native rendering (iOS UIKit, Android Compose)

**Where Canvas helps:**
- Pixel-perfect consistency across platforms
- Custom animations that would require native modules

**Where it doesn't:**
- Native controls (date pickers, keyboards) still better in DOM
- Startup time (Canvas + layout engine = larger bundle)

**Verdict:** Canvas doesn't replace React Native's value prop. Capacitor + fast DOM framework (like vertz) is more pragmatic.

---

### Capacitor + DOM vs Canvas Rendering

**Capacitor + Vertz (DOM):**
- ✅ Leverages browser optimizations
- ✅ Native controls for forms
- ✅ Accessibility built-in
- ✅ Smaller bundle
- ❌ Styling inconsistencies across platforms

**Capacitor + Vertz (Canvas):**
- ✅ Pixel-perfect rendering
- ✅ Custom animations
- ❌ Larger bundle (layout engine + text engine)
- ❌ Slower startup
- ❌ Accessibility requires extra work
- ❌ Poor interaction with native keyboards/controls

**Verdict:** DOM is the better default. Canvas for specific use cases (games, data viz).

---

## 6. Realistic Assessment

### What's Feasible in 3 Months?

**Proof of Concept: Hybrid Approach (Option C)**

**Scope:**
- `<Canvas>` component for isolated Canvas zones
- Render simple shapes (rectangles, circles, paths)
- Wire signals to Canvas draw calls
- Example: Real-time chart or animation widget embedded in DOM UI

**Deliverables:**
- Working demo: vertz app with Canvas chart that updates reactively
- API design: How developers opt into Canvas rendering
- Performance comparison: Canvas vs DOM for the same visualization

**Effort:** 4-6 weeks for one engineer with WebGL experience.

**Value:** Validates whether vertz's reactivity + Canvas is actually better than alternatives (React + D3, Svelte + Canvas).

---

### What's Feasible in 6 Months?

**Polished Hybrid System**

**Scope:**
- Mature `@vertz/canvas` package
- Layout primitives for Canvas (box model, basic flex)
- Text rendering via Canvas 2D (`fillText`)—limited but functional
- Hit testing for click/hover
- 5-10 examples (charts, animations, custom controls)

**Still not included:**
- Full CSS layout (Flexbox/Grid)
- Advanced text (shaping, BiDi, rich formatting)
- Accessibility parity

**Effort:** 1-2 engineers for 6 months.

**Value:** Usable for real projects (data dashboards, design tools, games). Niche but powerful.

---

### What's Feasible in 1 Year?

**Production-Ready Canvas Target**

**Scope:**
- Full layout engine (Yoga or Taffy via WebAssembly)
- Robust text rendering (Canvas 2D with font loading, line breaking)
- Accessibility layer (shadow DOM sync)
- Developer tooling (Canvas inspector)
- Documentation + migration guide

**Still challenging:**
- Full CSS feature parity (unlikely)
- Advanced text (shaping, BiDi)—may remain gaps
- Third-party library compatibility (many assume DOM)

**Effort:** 2-3 engineers for 1 year.

**Value:** Could be competitive for design tools, dashboards, creative apps. Unlikely to replace DOM for general web dev.

---

### Competitive Advantage or Distraction?

**Where Canvas rendering would be an advantage:**
1. **Design tools** (Figma competitors)
2. **Data visualization platforms** (Observable, Tableau alternatives)
3. **Creative coding tools** (p5.js, Processing)
4. **Games and interactive experiences**
5. **High-performance dashboards** (trading platforms, monitoring tools)

**Where it's a distraction:**
1. **Content sites** (blogs, marketing pages)
2. **SaaS web apps** (forms, CRUD interfaces)
3. **E-commerce** (product catalogs, checkout)
4. **General web development**

**Market reality:**
- 95% of web apps are better served by DOM
- 5% have genuine Canvas use cases
- That 5% is high-value (design tools, data viz) but niche

---

### Honest Recommendation

**If vertz's goal is to be a general web framework:**
→ **Don't do this.** It's a distraction. Focus on making DOM rendering faster, DX better, and ecosystem richer.

**If vertz is pivoting to target design tools / data viz / creative coding:**
→ **Do the hybrid approach (Option C).** Build `@vertz/canvas` as an opt-in package. Prove value with specific use cases before committing to more.

**If vertz wants a moonshot differentiator:**
→ **Do it, but be prepared for 2+ years of work.** Text rendering, accessibility, and layout are not quick wins. This is a multi-year investment that may not pay off.

---

## Conclusion

**The technology is feasible.** Vertz's fine-grained reactivity and compiler make it better positioned than React for Canvas rendering.

**The hard problems are real.** Text, accessibility, and layout are 80% of the effort. Expect years, not months.

**The hybrid approach (Option C) is the pragmatic path.** DOM for structure and text, Canvas for performance-critical zones. This solves real problems without over-reaching.

**Market fit is narrow.** Canvas rendering is revolutionary for design tools and data viz, overkill for general web apps.

**My recommendation:** Build a proof-of-concept hybrid system in 3 months. If it demonstrates clear value for a specific use case (e.g., real-time dashboards), invest 6-12 months in a polished `@vertz/canvas` package. Do **not** attempt to replace DOM rendering entirely unless vertz pivots to target a Canvas-first market (design tools, creative coding).

Be honest about tradeoffs. Canvas rendering is powerful but specialized. Don't sell it as a silver bullet.

---

**Next steps if proceeding:**
1. Prototype `<Canvas>` component with signal-driven drawing
2. Build 2-3 compelling examples (chart, animation, game)
3. Measure performance vs DOM equivalents
4. Assess developer ergonomics (is the API nice?)
5. Decide: niche feature or strategic bet?

Good luck. This is hard. But if you pull it off, it could be genuinely differentiated.
