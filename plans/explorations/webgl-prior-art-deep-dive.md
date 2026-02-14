# WebGL/Canvas Prior Art — Deep Dive Research

**Date:** 2026-02-14  
**Author:** josh  
**Status:** Research  
**Companion to:** `webgl-render-target.md`

## Executive Summary

**The Ask:** Go deeper on leveraging existing rendering engines (PixiJS, Konva, etc.) instead of building WebGL renderer from scratch.

**Key Finding:** **PixiJS as a rendering backend is the most promising path forward.** It solves 80% of the hard problems (text, events, performance) and would let vertz focus on its unique value prop: signals + compiler-driven reactivity.

**Recommendation:** Prototype `@vertz/canvas` as a declarative wrapper over PixiJS (similar to React Three Fiber's approach with Three.js). This gives us:
- Battle-tested WebGL renderer (PixiJS is mature, ~10 years old)
- Text rendering that actually works
- Hit testing and event system
- Asset loading and texture management
- ~460KB minified (PixiJS) vs. years building our own

**The Trade-off:** We're adding a dependency and losing some control. But we gain years of development time and avoid reinventing solved problems.

---

## 1. Figma's Engineering — What We Can Learn Without Rebuilding It

### Background

Figma is the gold standard for Canvas-based web apps. They've published extensively about their technical approach:

**Key Blog Posts & Talks (from public knowledge):**
- "Building a Professional Design Tool on the Web" (2017)
- "Figma's Engineering Values" 
- Conference talks at React Conf, WebAssembly Summit
- Various performance optimization posts

### What Figma Did

#### Text Rendering
- **Custom text engine:** Ported HarfBuzz (text shaping library) to WebAssembly
- **Font rasterization:** Custom implementation for crisp text at all zoom levels
- **Multi-year effort:** Dedicated team, 2+ years of development
- **Result:** Pixel-perfect text that works across platforms

**Learnings for vertz:**
- Text is NOT a "nice to have" feature — it's foundational
- Browser text rendering is incredibly complex (ligatures, emoji, RTL, font fallbacks)
- Building custom text = multi-year commitment
- **Avoid this unless text rendering IS the product**

#### Rendering Architecture
- **C++ core:** Main rendering engine written in C++, compiled to WebAssembly
- **Multi-threaded:** Heavy use of Web Workers for off-main-thread work
- **Tile-based rendering:** Only render visible portions at current zoom
- **Spatial indexing:** R-trees for fast hit testing with thousands of objects
- **GPU acceleration:** WebGL for rendering, careful about texture memory

**Learnings for vertz:**
- Figma's approach justified because design tools NEED pixel-perfect rendering
- They control the entire stack (rendering, layout, text, events)
- But this is appropriate for their domain — not for general web UIs
- **Their success doesn't validate Canvas for general web apps**

#### Performance Optimizations
- **Lazy loading:** Load document parts on-demand
- **Aggressive caching:** Rendered tiles cached to GPU textures
- **Dirty region tracking:** Only repaint what changed
- **Virtualization:** Don't render off-screen objects

**Learnings for vertz:**
- These optimizations are table stakes for Canvas-based rendering
- Vertz's fine-grained reactivity helps here (surgical updates)
- But we'd still need the infrastructure (spatial indexing, tile caching, etc.)

#### What Figma Punted On
- **Accessibility:** Minimal. Design tools get a pass; user-facing apps don't
- **Text input:** Limited rich text editing (not a word processor)
- **Forms:** No traditional form controls
- **SEO:** Not applicable (it's an app, not content)

**Learnings for vertz:**
- Figma could ignore problems that vertz can't
- General web frameworks need accessibility, SEO, forms
- Canvas rendering means rebuilding all of this

### The Figma Takeaway

**What we should copy:**
- Tile-based rendering for large canvases
- Spatial indexing for hit testing
- Dirty region tracking for efficient repaints

**What we should NOT attempt:**
- Custom text rendering engine (use PixiJS or browser)
- WebAssembly core (premature optimization)
- C++ rendering engine (overkill for vertz's scope)

**The real lesson:** Figma succeeded because Canvas rendering was core to their product vision (pixel-perfect design tool). For vertz, it's a feature, not the foundation. **Use existing libraries.**

---

## 2. PixiJS — The Best Candidate for a Rendering Backend

### What is PixiJS?

**PixiJS** is a mature, battle-tested 2D WebGL rendering library.
- **10+ years old** (first release ~2013)
- **Used in production** by thousands of games, interactive experiences, data viz tools
- **Active development:** Regular updates, strong community
- **Bundle size:** ~460KB minified, ~140KB gzipped (v8.x)
- **WebGPU support:** Already shipping WebGPU renderer alongside WebGL

**GitHub:** https://github.com/pixijs/pixijs  
**Docs:** https://pixijs.com/guides

### Architecture Overview

#### Scene Graph Model
```js
// PixiJS uses a tree structure (like the DOM)
const app = new PIXI.Application();
const container = new PIXI.Container(); // like a <div>
const sprite = new PIXI.Sprite(texture);   // like an <img>

container.addChild(sprite);
app.stage.addChild(container);
```

**Key insight:** This is a perfect match for JSX/component trees. Vertz could compile components to PixiJS display objects.

#### Display Objects Hierarchy
- **Container:** Group multiple objects, apply transforms
- **Sprite:** Texture-based rendering (images, texture atlases)
- **Graphics:** Vector drawing (rectangles, circles, paths)
- **Text:** Text rendering with WebGL (bitmap fonts) or fallback to Canvas2D
- **Mesh:** Custom geometry for advanced effects

**All display objects have:**
- Position (x, y)
- Scale (x, y)
- Rotation
- Anchor point
- Visibility
- Alpha/tint
- Interactive event handling

### Text Rendering in PixiJS

**Three approaches:**

1. **PIXI.Text** (Canvas2D fallback)
   - Renders text to a Canvas2D texture, then uploads to GPU
   - Supports all CSS fonts, styles
   - **Pros:** Works out of the box, full font support
   - **Cons:** Blurry at scale, performance hit for lots of text

2. **PIXI.BitmapText** (bitmap fonts)
   - Pre-rendered font atlas (like old game engines)
   - **Pros:** Fast, crisp at designed size
   - **Cons:** Requires font generation, limited to ASCII/predefined characters

3. **PIXI.TextStyle** (Canvas2D with advanced styles)
   - Richer styling: shadows, strokes, gradients
   - **Pros:** Looks great, flexible
   - **Cons:** Still Canvas2D under the hood

**Verdict for vertz:** Start with `PIXI.Text` for simple cases, allow bitmap fonts for performance-critical text (like data viz labels). This is VASTLY better than building our own text renderer.

### Layout in PixiJS

**PixiJS does NOT have layout.**  
You manually position everything with x, y coordinates.

```js
sprite.x = 100;
sprite.y = 200;
```

**This is the gap vertz would need to fill.**

**Options:**

1. **Manual layout in vertz components**
   ```tsx
   <Canvas>
     <Rect x={10} y={10} width={100} height={50} />
     <Text x={10} y={70} text="Hello" />
   </Canvas>
   ```
   Simple but tedious for complex UIs.

2. **Integrate Yoga layout engine**
   ```tsx
   <Canvas>
     <Flex direction="column" gap={10}>
       <Rect width={100} height={50} />
       <Text text="Hello" />
     </Flex>
   </Canvas>
   ```
   Run Yoga (Facebook's flexbox engine, compiled to WASM) to compute positions, then apply to PixiJS objects.
   
   **Effort:** 2-4 weeks to integrate. Yoga is ~200KB (WASM).

3. **Constraint-based positioning**
   ```tsx
   <Rect id="box" width={100} height={50} />
   <Text text="Hello" below="box" margin={10} />
   ```
   Simple constraint solver (like iOS Auto Layout, but simpler).
   
   **Effort:** 2-3 weeks for basic implementation.

**Recommendation:** Start with manual layout (option 1) for proof-of-concept. Add Yoga (option 2) if it proves valuable. Constraint-based layout (option 3) is interesting but too experimental.

### Event Handling & Hit Testing

**PixiJS has this solved.**

```js
sprite.eventMode = 'static'; // or 'dynamic'
sprite.on('pointerdown', (event) => {
  console.log('clicked!', event.global.x, event.global.y);
});
```

**Supports:**
- Mouse events: click, hover, drag
- Touch events: tap, swipe, pinch
- Pointer API (unified mouse/touch)
- Event bubbling up the scene graph
- Hit area customization (for non-rectangular shapes)

**Under the hood:**
- Efficient hit testing via bounding boxes
- Option for pixel-perfect hit testing (check alpha channel)
- Spatial acceleration for large scenes

**Verdict for vertz:** We get this for free. Just need to wire PixiJS events to vertz's event system.

### Performance at Scale

**PixiJS is designed for games and data viz with thousands of objects.**

**Optimizations built-in:**
- **Batch rendering:** Combines draw calls for objects using same texture
- **Culling:** Doesn't render off-screen objects
- **Texture atlases:** Pack multiple images into one texture (reduce draw calls)
- **Object pooling:** Reuse display objects instead of creating/destroying
- **Render groups:** Optimize rendering order for fewer state changes

**Benchmarks (from community reports):**
- 10,000 sprites: 60 FPS on mid-range hardware
- 50,000 particles: 30-40 FPS (with culling)
- Real-time data viz: handles hundreds of updating charts

**Verdict for vertz:** Performance is solid. We'd get this for free.

### What PixiJS Doesn't Have

1. **Layout engine** — need to add (Yoga or manual)
2. **Accessibility** — would need semantic DOM layer (same as any Canvas approach)
3. **Forms/inputs** — would overlay DOM elements (hybrid approach)
4. **Semantic HTML** — can't render actual HTML inside Canvas

**These are limitations of Canvas rendering in general, not PixiJS specifically.**

### Bundle Size Analysis

**PixiJS Core (~460KB minified):**
- Renderer (WebGL/WebGPU)
- Scene graph
- Display objects (Sprite, Graphics, Container)
- Event system
- Asset loader

**Tree-shakeable:**
- Can import only what you use
- Minimal bundle: ~200KB (core renderer + basic objects)

**Comparison:**
- React DOM: ~130KB
- Three.js: ~580KB
- Vertz core: ~8KB
- **@vertz/canvas with PixiJS: ~208-460KB**

**Is this acceptable?**
- For data viz, games, design tools: YES
- For content sites: NO (too heavy)
- For SPAs with canvas components: YES (if opt-in)

**Mitigation:**
- Code-split `@vertz/canvas` — only load when needed
- Tree-shake unused PixiJS features
- Provide "minimal" and "full" builds

---

## 3. Could Vertz Compile to PixiJS Primitives?

### The Vision

**Like React Three Fiber does for Three.js:**

```tsx
// React Three Fiber (3D)
<Canvas>
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="hotpink" />
  </mesh>
</Canvas>

// Vertz Canvas (2D with PixiJS)
<Canvas>
  <Container x={signal.x} y={100}>
    <Sprite texture={asset.texture} />
    <Text text={signal.message} style={{fill: 'white'}} />
  </Container>
</Canvas>
```

### Architecture: Vertz → PixiJS

**Approach 1: Runtime Renderer (Like React Three Fiber)**

```tsx
// Developer writes this
<Canvas width={800} height={600}>
  <Sprite x={x()} y={50} texture="bunny.png" rotation={rotation()} />
</Canvas>

// Vertz creates this
const app = new PIXI.Application({width: 800, height: 600});
const sprite = new PIXI.Sprite(PIXI.Texture.from('bunny.png'));
sprite.x = x();
sprite.y = 50;

// Reactivity: when signals change, update PixiJS objects
effect(() => {
  sprite.x = x();
  sprite.rotation = rotation();
});
```

**How it works:**
1. `<Canvas>` creates a PixiJS Application
2. Each child component maps to a PixiJS display object
3. Vertz's signals wire to PixiJS property updates
4. On signal change, update the corresponding PixiJS property

**Pros:**
- Simple mental model (JSX = scene graph)
- Vertz's fine-grained reactivity is perfect here (no vdom diffing)
- Composable components
- Familiar to React Three Fiber users

**Cons:**
- Runtime overhead (creating/managing display objects)
- Larger bundle (include PixiJS + renderer logic)

**Approach 2: Compile-Time Code Generation**

```tsx
// Developer writes this
<Canvas>
  <Sprite x={x()} texture="bunny.png" />
</Canvas>

// Vertz compiler generates this
const app = new PIXI.Application();
const sprite = new PIXI.Sprite(PIXI.Texture.from('bunny.png'));
app.stage.addChild(sprite);

effect(() => { sprite.x = x(); });
```

**Pros:**
- Minimal runtime overhead
- Leverages vertz's compiler strength
- Could optimize away unused features

**Cons:**
- Less flexible (harder to do dynamic composition)
- Debugging harder (generated code)
- Still need PixiJS runtime (~460KB)

**Approach 3: Hybrid (Compile + Runtime)**

- Compiler optimizes static structure
- Runtime handles dynamic composition
- Best of both worlds

**Recommendation:** Start with **Approach 1** (runtime renderer). It's simpler, more flexible, and easier to debug. Vertz's fine-grained reactivity makes the runtime overhead negligible.

### Component Mapping

| Vertz Component | PixiJS Equivalent |
|-----------------|-------------------|
| `<Canvas>` | `PIXI.Application` (root) |
| `<Container>` | `PIXI.Container` (grouping) |
| `<Sprite>` | `PIXI.Sprite` (images) |
| `<Graphics>` | `PIXI.Graphics` (shapes) |
| `<Text>` | `PIXI.Text` (text) |
| `<Mesh>` | `PIXI.Mesh` (custom geometry) |

**Example mapping:**

```tsx
// Vertz
<Container x={100} y={50} rotation={angle()}>
  <Sprite texture="player.png" />
</Container>

// Becomes
const container = new PIXI.Container();
container.x = 100;
container.y = 50;
effect(() => { container.rotation = angle(); });

const sprite = new PIXI.Sprite(PIXI.Texture.from('player.png'));
container.addChild(sprite);
```

### Handling Reactivity

**This is vertz's superpower.**

```tsx
// Signal drives PixiJS property
const x = signal(0);

<Sprite x={x()} texture="bunny.png" />

// Every time x changes, sprite.x updates
effect(() => {
  sprite.x = x();
});
```

**No virtual DOM diffing. No reconciliation. Just direct updates.**

**This is better than React Three Fiber:**
- R3F has to run reconciliation (diff virtual tree)
- Vertz skips straight to "update the changed property"
- Lower overhead, more predictable performance

### Managing PixiJS Lifecycle

**Need to handle:**
- Creating display objects when components mount
- Updating properties when signals change
- Removing objects when components unmount
- Cleaning up textures/resources

**Sketch:**

```ts
function createSprite(props) {
  const sprite = new PIXI.Sprite(PIXI.Texture.from(props.texture));
  
  // Wire up reactive properties
  if (typeof props.x === 'function') {
    effect(() => { sprite.x = props.x(); });
  } else {
    sprite.x = props.x;
  }
  
  // Similar for y, rotation, scale, etc.
  
  // Cleanup on unmount
  onCleanup(() => {
    sprite.destroy();
  });
  
  return sprite;
}
```

**This is the core of the vertz → PixiJS bridge.**

---

## 4. Other Engines — Why PixiJS Wins

### Konva.js

**What it is:**
- Canvas 2D rendering library (not WebGL)
- React bindings: `react-konva`
- Good for interactive 2D graphics (drawing apps, diagrams)

**Architecture:**
- Stage → Layer → Shape hierarchy
- Similar to PixiJS scene graph
- Canvas2D rendering (not GPU-accelerated by default)

**Pros:**
- Simple API
- Good React integration (react-konva works well)
- Easier to get started than PixiJS

**Cons:**
- **Canvas 2D, not WebGL** — slower for large scenes
- Less mature text rendering than PixiJS
- Smaller ecosystem (fewer plugins/extensions)

**Example (react-konva):**
```jsx
<Stage width={800} height={600}>
  <Layer>
    <Rect x={20} y={20} width={100} height={100} fill="red" />
    <Circle x={200} y={100} radius={50} fill="green" />
  </Layer>
</Stage>
```

**Why not Konva for vertz?**
- Canvas2D is slower than WebGL for complex scenes
- PixiJS has better performance at scale
- PixiJS has WebGPU support (future-proofing)

**When to use Konva:**
- Simple drawing apps
- Not performance-critical
- Prefer Canvas2D simplicity over WebGL complexity

**Verdict:** Konva is good, but PixiJS is better for vertz's needs.

### Two.js

**What it is:**
- Renderer-agnostic 2D library
- Supports SVG, Canvas2D, and WebGL backends
- Inspired by Processing/p5.js (creative coding)

**Architecture:**
- Unified API across renderers
- Scene graph model
- Animation loop built-in

**Pros:**
- Renderer flexibility (can switch between SVG/Canvas/WebGL)
- Clean API for vector graphics
- Good for creative coding

**Cons:**
- **Smaller community** than PixiJS or Konva
- Less optimized for performance (targets creative coding, not games)
- WebGL backend is less mature than PixiJS

**Example:**
```js
const two = new Two({
  type: Two.Types.webgl,
  width: 800,
  height: 600
});

const circle = two.makeCircle(100, 100, 50);
circle.fill = 'red';
```

**Why not Two.js for vertz?**
- Smaller ecosystem (fewer resources, examples)
- PixiJS is more battle-tested for WebGL
- Two.js focuses on creative coding, not UI/data viz

**When to use Two.js:**
- Creative coding projects
- Need SVG output (for print/export)
- Want renderer flexibility

**Verdict:** Interesting, but PixiJS is a safer choice.

### Skia (via CanvasKit)

**What it is:**
- Skia is Google's 2D graphics engine (used in Chrome, Android, Flutter)
- CanvasKit is Skia compiled to WebAssembly for web

**Architecture:**
- Native graphics engine (C++)
- Compiled to WASM (~2MB uncompressed, ~600KB gzipped)
- Canvas2D-like API with advanced features

**Pros:**
- **Pixel-perfect** rendering (same as native Flutter)
- Advanced text rendering (HarfBuzz, full Unicode support)
- Same engine across web and native (Flutter)

**Cons:**
- **Bundle size:** ~600KB gzipped (huge for web)
- Slow startup (WASM initialization)
- Overkill for most web apps
- Accessibility is painful (same as Flutter Web)

**Example:**
```js
const surface = CanvasKit.MakeCanvasSurface('canvas-id');
const canvas = surface.getCanvas();

const paint = new CanvasKit.Paint();
paint.setColor(CanvasKit.Color(255, 0, 0, 1));

canvas.drawCircle(100, 100, 50, paint);
```

**Why not CanvasKit for vertz?**
- **Way too heavy** for general web apps
- Flutter Web already exists (don't reinvent it)
- Startup cost is too high

**When to use CanvasKit:**
- Porting Flutter apps to web
- Need pixel-perfect consistency with native
- Advanced text rendering is core requirement

**Verdict:** Not suitable for vertz. Too heavy, too niche.

### Yoga Layout Engine

**What it is:**
- Facebook's flexbox layout engine (C++)
- Used in React Native
- Available as WASM for web

**Architecture:**
- Pure layout calculation (no rendering)
- Implements CSS Flexbox spec
- Tree of nodes with flex properties → computed positions

**Pros:**
- Battle-tested (React Native uses it)
- Fast (native code via WASM)
- Full flexbox support

**Cons:**
- **~200KB bundle size** (WASM)
- C++ API (needs wrapper for JS)
- Only flexbox (no Grid, positioning, etc.)

**Example:**
```js
const root = Yoga.Node.create();
root.setWidth(800);
root.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);

const child = Yoga.Node.create();
child.setWidth(100);
child.setHeight(50);
root.insertChild(child, 0);

root.calculateLayout(); // Compute positions
const layout = child.getComputedLayout(); // {left, top, width, height}
```

**How vertz could use Yoga:**

1. Define layout in JSX:
```tsx
<Canvas>
  <Flex direction="row" gap={10}>
    <Sprite width={100} height={50} />
    <Text text="Hello" />
  </Flex>
</Canvas>
```

2. Run Yoga to compute positions
3. Apply computed positions to PixiJS objects

**Effort:** 2-4 weeks to integrate properly.

**Alternative: Taffy**
- Rust-based layout engine (Flexbox + Grid)
- Used by Dioxus, Bevy UI
- Smaller than Yoga (~100KB WASM)
- More modern codebase

**Verdict:** Yoga/Taffy are viable for layout. Add only if manual positioning proves too limiting.

---

## 5. The Key Question: Should Vertz Use PixiJS as the Rendering Backend?

### The Case FOR Using PixiJS

**1. Years of Development Time Saved**
- Text rendering: ✅ Works out of the box
- Event system: ✅ Solved
- Asset loading: ✅ Built-in
- WebGL optimization: ✅ Mature
- Cross-platform: ✅ Tested everywhere

**2. Battle-Tested in Production**
- Thousands of games, data viz tools, interactive sites
- Known performance characteristics
- Active community (quick bug fixes, examples)

**3. Vertz Can Focus on Its Unique Value**
- Signals + fine-grained reactivity
- Compiler optimizations
- Developer experience
- NOT on "how to render a circle in WebGL"

**4. Bundle Size is Acceptable for Target Use Cases**
- ~460KB is fine for:
  - Data visualization dashboards
  - Design tools
  - Games and interactive experiences
- NOT fine for:
  - Content sites (blogs, marketing pages)
  - SEO-critical apps
- **Solution:** Make it opt-in (`@vertz/canvas` package)

**5. Follows Proven Pattern**
- React Three Fiber uses Three.js
- Solid-three uses Three.js
- Wrapping mature libraries > reinventing

### The Case AGAINST Using PixiJS

**1. Dependency on External Library**
- If PixiJS breaks, vertz breaks
- If PixiJS changes API, vertz needs to adapt
- Less control over roadmap

**2. Bundle Size**
- ~460KB is still large
- Can't remove features vertz doesn't need (without forking)

**3. PixiJS's API Might Not Match Vertz's Vision**
- Imperative API (vertz is declarative)
- Scene graph model (might want something else?)

**4. Limited Differentiation**
- "Vertz Canvas powered by PixiJS" is less exciting than "Vertz's custom WebGL renderer"
- Marketing challenge?

### My Verdict: **USE PIXIJS**

**The pragmatic choice is clear:**

✅ **Use PixiJS as the rendering backend.**

**Why:**
1. **Time to market:** Proof-of-concept in weeks, not years
2. **Risk mitigation:** Proven tech, not experimental
3. **Focus:** Let vertz be great at reactivity and DX, not WebGL minutiae
4. **Ecosystem:** Tap into PixiJS community (plugins, examples, support)

**How to position it:**
- "Vertz Canvas: Declarative 2D graphics with PixiJS, powered by fine-grained reactivity"
- Emphasize vertz's DX (signals, compiler, components), not rendering engine
- Like React Three Fiber: "We make PixiJS easier to use"

**When to revisit:**
- If PixiJS becomes unmaintained (unlikely)
- If bundle size becomes a blocker (could fork and strip down)
- If vertz's Canvas rendering proves to be a core strategic bet (build custom renderer)

**For now:** Use PixiJS, ship fast, learn what users actually need.

---

## 6. What Would @vertz/canvas Look Like?

### API Design Sketch

**Goal:** Make PixiJS feel like native vertz components.

#### Basic Usage

```tsx
import { Canvas, Sprite, Container, Text } from '@vertz/canvas';
import { signal } from 'vertz';

function Game() {
  const x = signal(100);
  const score = signal(0);
  
  return (
    <Canvas width={800} height={600} background="#1099bb">
      <Container x={x()} y={100}>
        <Sprite texture="player.png" />
      </Container>
      
      <Text 
        text={`Score: ${score()}`} 
        x={10} 
        y={10} 
        style={{ fill: 'white', fontSize: 24 }}
      />
    </Canvas>
  );
}
```

**What happens:**
- `<Canvas>` creates a PixiJS Application
- `<Container>` creates a PIXI.Container
- `<Sprite>` creates a PIXI.Sprite
- Signal changes trigger PixiJS property updates

#### Graphics (Vector Drawing)

```tsx
import { Graphics } from '@vertz/canvas';

function Chart() {
  const data = signal([10, 20, 15, 30, 25]);
  
  return (
    <Canvas>
      <Graphics
        draw={(g, values) => {
          g.clear();
          g.lineStyle(2, 0x0000FF);
          g.moveTo(0, 100);
          
          values.forEach((val, i) => {
            g.lineTo(i * 20, 100 - val * 2);
          });
        }}
        data={data()}
      />
    </Canvas>
  );
}
```

**Alternative (more declarative):**

```tsx
<Canvas>
  <Path
    points={data().map((val, i) => ({ x: i * 20, y: 100 - val * 2 }))}
    stroke="#0000FF"
    strokeWidth={2}
  />
</Canvas>
```

#### Events & Interactivity

```tsx
function InteractiveSprite() {
  const color = signal('red');
  
  return (
    <Sprite
      texture="button.png"
      interactive
      onClick={() => {
        color.set(color() === 'red' ? 'blue' : 'red');
      }}
      onPointerEnter={() => console.log('hover')}
      tint={color()}
    />
  );
}
```

**PixiJS events map to vertz events:**
- `pointerdown` → `onClick`
- `pointermove` → `onPointerMove`
- `pointerover` → `onPointerEnter`

#### Asset Loading

```tsx
import { useAssets } from '@vertz/canvas';

function App() {
  const assets = useAssets({
    player: 'sprites/player.png',
    enemy: 'sprites/enemy.png',
    font: 'fonts/arial.ttf'
  });
  
  if (!assets.loaded) {
    return <Canvas><Text text="Loading..." /></Canvas>;
  }
  
  return (
    <Canvas>
      <Sprite texture={assets.player} />
    </Canvas>
  );
}
```

**Under the hood:** Uses PIXI.Assets (built-in asset loader).

#### Animation Loop

```tsx
import { useTicker } from '@vertz/canvas';

function AnimatedSprite() {
  const rotation = signal(0);
  
  useTicker((delta) => {
    rotation.update(r => r + 0.01 * delta);
  });
  
  return <Sprite texture="bunny.png" rotation={rotation()} />;
}
```

**Alternative (more declarative):**

```tsx
<Sprite
  texture="bunny.png"
  animate={{
    rotation: { from: 0, to: Math.PI * 2, duration: 2000, repeat: Infinity }
  }}
/>
```

### Opting Into Canvas Rendering

**Approach 1: Per-Component**

```tsx
// Regular DOM rendering
function App() {
  return (
    <div class="dashboard">
      <header>My App</header>
      
      {/* This part renders to Canvas */}
      <Canvas class="chart">
        <LineChart data={signal.data} />
      </Canvas>
      
      <footer>Status: {signal.status}</footer>
    </div>
  );
}
```

**Approach 2: Per-Section (Compiler Hint)**

```tsx
// Tell vertz compiler: this whole subtree is Canvas
function DataViz() {
  return (
    <canvas:container> {/* Special namespace */}
      <Flex direction="column">
        <Chart data={data1()} />
        <Chart data={data2()} />
      </Flex>
    </canvas:container>
  );
}
```

Compiler sees `canvas:` namespace and targets PixiJS instead of DOM.

**Approach 3: Component-Level Pragma**

```tsx
// Decorator or export annotation
export const MyChart = canvas((props) => {
  return <Sprite texture="chart.png" />;
});

// Usage (looks like normal component)
<MyChart data={myData} />
```

**Recommendation:** Start with **Approach 1** (explicit `<Canvas>` wrapper). Simple, predictable, no magic.

### Layout Integration

**Manual Layout (MVP):**

```tsx
<Canvas>
  <Sprite x={10} y={10} />
  <Text x={10} y={70} text="Hello" />
</Canvas>
```

**Flexbox Layout (Phase 2):**

```tsx
import { Flex } from '@vertz/canvas/layout'; // Separate import

<Canvas>
  <Flex direction="column" gap={10} padding={20}>
    <Sprite width={100} height={50} />
    <Text text="Hello" />
  </Flex>
</Canvas>
```

**Under the hood:**
- Run Yoga layout algorithm
- Compute x, y, width, height for each child
- Apply to PixiJS objects
- Re-run on window resize or signal changes

**Bundle cost:** +200KB for Yoga (WASM).

### Accessibility Strategy

**Problem:** Canvas is opaque to screen readers.

**Solution: Semantic DOM Layer (Hybrid)**

```tsx
<Canvas aria-label="Data visualization">
  {/* Canvas rendering */}
  <LineChart data={data()} />
  
  {/* Hidden DOM for accessibility */}
  <div class="sr-only" role="img" aria-label="Line chart">
    <table>
      <tr><th>Month</th><th>Value</th></tr>
      {data().map(row => <tr><td>{row.month}</td><td>{row.value}</td></tr>)}
    </table>
  </div>
</Canvas>
```

**Automatic sync:**
- Vertz compiler generates semantic DOM alongside Canvas
- Keep in sync via signals
- Screen reader sees table, sighted users see chart

**Effort:** 2-3 weeks to build, ongoing maintenance.

### Developer Experience

**Good:**
- Familiar JSX/component model
- Signals drive everything (no special API)
- TypeScript support (PixiJS has types)
- DevTools: inspect component tree, see signal values

**Challenges:**
- Can't "inspect element" in browser DevTools (Canvas is opaque)
- Need custom Canvas inspector (like React DevTools)

**Solution:** Build `@vertz/canvas-devtools`
- Overlay scene graph on page
- Click to inspect object properties
- Show signal dependencies
- Performance metrics (FPS, draw calls, texture memory)

**Effort:** 4-6 weeks for basic version.

---

## 7. Practical Next Steps

### Phase 1: Proof of Concept (2-3 weeks)

**Goal:** Validate PixiJS + vertz reactivity works well together.

**Scope:**
- Minimal `@vertz/canvas` package
- Support: `<Canvas>`, `<Sprite>`, `<Container>`, `<Text>`, `<Graphics>`
- Wire signals to PixiJS property updates
- Basic event handling (onClick, onPointerMove)
- One demo: animated sprites driven by signals

**Deliverables:**
- Working demo app
- Measure performance (how many objects at 60fps?)
- Developer ergonomics (does the API feel good?)

**Success criteria:**
- Signals update PixiJS smoothly (no jank)
- API feels "vertz-like" (not bolted on)
- Performance beats DOM for this use case

### Phase 2: MVP Package (6-8 weeks)

**Goal:** Usable for real projects.

**Scope:**
- Full PixiJS display object coverage
- Asset loading (`useAssets` hook)
- Animation loop (`useTicker` hook)
- Manual layout (x, y positioning)
- TypeScript definitions
- Documentation + 5 examples

**Examples:**
1. Animated sprite game
2. Data visualization (line chart)
3. Interactive diagram (flowchart)
4. Image manipulation tool
5. Particle effects

**Bundle size target:** <500KB (including PixiJS).

### Phase 3: Production-Ready (3-4 months)

**Goal:** Deploy in high-stakes projects.

**Scope:**
- Layout engine (Yoga integration)
- Accessibility layer (semantic DOM sync)
- DevTools (Canvas inspector)
- Performance profiling tools
- 20+ examples
- Migration guide (DOM → Canvas)
- Case studies (success stories)

**Non-goals (future work):**
- Custom WebGL renderer (stick with PixiJS)
- 3D support (use Three.js separately)
- Server-side Canvas rendering (punt for now)

---

## 8. Competitive Analysis: How Would Vertz Canvas Compare?

### vs React Three Fiber (3D)

**R3F:**
- React wrapper for Three.js (3D)
- Virtual DOM → reconciliation → Three.js updates

**Vertz Canvas:**
- Vertz wrapper for PixiJS (2D)
- Signals → direct updates (no reconciliation)

**Advantage vertz:**
- Lower overhead (fine-grained reactivity)
- Simpler mental model (no vdom)

**Advantage R3F:**
- Mature ecosystem (years of examples, libraries)
- 3D use cases (games, CAD, AR/VR)

### vs react-konva

**react-konva:**
- React wrapper for Konva.js (Canvas2D)
- Virtual DOM → reconciliation → Konva updates

**Vertz Canvas:**
- Vertz wrapper for PixiJS (WebGL)
- Signals → direct updates

**Advantage vertz:**
- Better performance (WebGL > Canvas2D)
- Fine-grained reactivity (less overhead)
- WebGPU support (future-proofing)

**Advantage react-konva:**
- Simpler (Canvas2D is easier than WebGL)
- React ecosystem (more users, examples)

### vs Figma

**Figma:**
- Custom C++ renderer → WASM → Canvas
- Years of development, specialized for design tools

**Vertz Canvas:**
- PixiJS renderer (JavaScript/WebGL)
- Weeks to ship, generalized for UI/data viz

**Advantage Figma:**
- Pixel-perfect rendering
- Advanced text engine
- Optimized for design tools

**Advantage vertz:**
- Faster to build (use PixiJS)
- General-purpose (not just design tools)
- Smaller bundle (~460KB vs ~2MB WASM)

### vs Just Using PixiJS Directly

**PixiJS directly:**
```js
const sprite = new PIXI.Sprite(texture);
sprite.x = 100;
app.stage.addChild(sprite);
```

**Vertz Canvas:**
```tsx
<Sprite x={100} texture={texture} />
```

**Advantage vertz:**
- Declarative (JSX is clearer than imperative)
- Reactive (signals drive updates automatically)
- Component composition (reusable, testable)

**Advantage PixiJS directly:**
- Lower overhead (no wrapper)
- Full control (access all PixiJS features)

**Target audience:**
- Use PixiJS directly: game developers, low-level control needed
- Use vertz Canvas: app developers, prefer declarative/reactive style

---

## 9. Risks & Mitigations

### Risk 1: PixiJS Breaking Changes

**Risk:** PixiJS updates API, breaks vertz.

**Mitigation:**
- Pin PixiJS version (don't auto-upgrade)
- Abstract PixiJS behind vertz API (insulate from changes)
- Monitor PixiJS roadmap, plan migrations

**Likelihood:** Low (PixiJS has stable API).

### Risk 2: Bundle Size Bloat

**Risk:** ~460KB is too large, kills adoption.

**Mitigation:**
- Make `@vertz/canvas` fully opt-in (not in core)
- Tree-shake unused PixiJS features
- Provide "minimal" build (~200KB)
- Document bundle size clearly

**Likelihood:** Medium (but acceptable for target use cases).

### Risk 3: Accessibility Lawsuit

**Risk:** Canvas-only UI violates ADA, user sues.

**Mitigation:**
- Document accessibility limitations clearly
- Provide semantic DOM layer option (hybrid approach)
- Recommend DOM for user-facing UIs, Canvas for data viz

**Likelihood:** Medium (if used improperly).

### Risk 4: PixiJS Ecosystem Decline

**Risk:** PixiJS community shrinks, library becomes unmaintained.

**Mitigation:**
- Monitor GitHub activity, community engagement
- Have contingency plan (fork PixiJS? Switch to Three.js?)
- Build relationships with PixiJS maintainers

**Likelihood:** Low (PixiJS is healthy, active).

### Risk 5: Users Expect Full CSS Layout

**Risk:** "Why can't I use flexbox/grid in Canvas?"

**Mitigation:**
- Set expectations: Canvas is NOT the DOM
- Provide Yoga integration (flexbox only)
- Document limitations in FAQ
- Position as "Canvas for special use cases, DOM for general UI"

**Likelihood:** High (but manageable with documentation).

---

## 10. Final Recommendation

### Build It: @vertz/canvas Powered by PixiJS

**Timeline:**
- **Proof of concept:** 2-3 weeks
- **MVP package:** 6-8 weeks
- **Production-ready:** 3-4 months

**Investment:**
- 1 engineer (full-time) for 3 months
- Part-time support from vertz core team

**Success Metrics:**
- 5+ real projects using it
- 100+ GitHub stars
- Positive feedback on DX

**Go/No-Go After Proof of Concept:**
- If signals + PixiJS feel smooth → continue
- If API is awkward or performance is bad → pause and reassess

### What This Enables

**Use cases:**
- **Data visualization:** Real-time dashboards, charts, graphs
- **Design tools:** Drawing apps, diagram editors
- **Games:** 2D games, interactive experiences
- **Creative coding:** Generative art, visualizations
- **Performance-critical UI:** Thousands of updating elements

**Positioning:**
> "Vertz Canvas: Bring the power of WebGL to your web apps with the simplicity of JSX and the performance of fine-grained reactivity. Built on PixiJS, designed for developers."

### What This Doesn't Do

**Not for:**
- Content sites (blogs, marketing pages)
- SEO-critical pages
- Accessibility-first applications (without hybrid approach)
- General web UI (use DOM instead)

**Be honest about tradeoffs:**
- "Canvas is fast for graphics, but DOM is better for text-heavy UIs."
- "Use Canvas where it helps, not everywhere."

### The Bottom Line

**Vertz should build @vertz/canvas, powered by PixiJS.**

It's the pragmatic path that:
- ✅ Leverages existing, battle-tested tech
- ✅ Ships fast (weeks, not years)
- ✅ Lets vertz focus on its unique value (signals + compiler)
- ✅ Opens up high-value use cases (data viz, design tools, games)
- ✅ Doesn't over-commit (opt-in package, not core)

Start with a proof of concept. Validate the approach. Then decide how deep to go.

---

## Appendix: Code Examples

### Example 1: Animated Line Chart

```tsx
import { Canvas, Graphics } from '@vertz/canvas';
import { signal, effect } from 'vertz';

function LineChart(props: { data: Signal<number[]> }) {
  return (
    <Canvas width={800} height={400} background="#f5f5f5">
      <Graphics
        draw={(g, values) => {
          g.clear();
          g.lineStyle(3, 0x2196F3);
          
          const width = 800;
          const height = 400;
          const step = width / (values.length - 1);
          const scale = height / Math.max(...values);
          
          g.moveTo(0, height - values[0] * scale);
          
          values.forEach((val, i) => {
            g.lineTo(i * step, height - val * scale);
          });
        }}
        data={props.data()}
      />
    </Canvas>
  );
}

// Usage
const data = signal([10, 25, 15, 40, 30, 45, 35]);

setInterval(() => {
  data.update(arr => [...arr.slice(1), Math.random() * 50]);
}, 1000);

<LineChart data={data} />
```

### Example 2: Interactive Draggable Sprites

```tsx
import { Canvas, Sprite, Container } from '@vertz/canvas';
import { signal } from 'vertz';

function DraggableSprite(props: { texture: string }) {
  const x = signal(100);
  const y = signal(100);
  const dragging = signal(false);
  
  return (
    <Sprite
      texture={props.texture}
      x={x()}
      y={y()}
      anchor={0.5}
      interactive
      onPointerDown={() => dragging.set(true)}
      onPointerUp={() => dragging.set(false)}
      onPointerMove={(e) => {
        if (dragging()) {
          x.set(e.global.x);
          y.set(e.global.y);
        }
      }}
      tint={dragging() ? 0xFFFF00 : 0xFFFFFF}
    />
  );
}

// Usage
<Canvas width={800} height={600}>
  <DraggableSprite texture="player.png" />
  <DraggableSprite texture="enemy.png" />
</Canvas>
```

### Example 3: Particle System

```tsx
import { Canvas, Sprite, useTicker } from '@vertz/canvas';
import { signal } from 'vertz';

function Particle() {
  const x = signal(Math.random() * 800);
  const y = signal(0);
  const speed = Math.random() * 2 + 1;
  
  useTicker(() => {
    y.update(val => {
      const newY = val + speed;
      return newY > 600 ? 0 : newY;
    });
  });
  
  return <Sprite texture="particle.png" x={x()} y={y()} scale={0.5} />;
}

function ParticleSystem() {
  const particles = Array.from({ length: 100 }, (_, i) => (
    <Particle key={i} />
  ));
  
  return (
    <Canvas width={800} height={600} background="#000000">
      {particles}
    </Canvas>
  );
}
```

### Example 4: Flexbox Layout (with Yoga)

```tsx
import { Canvas, Sprite, Text } from '@vertz/canvas';
import { Flex } from '@vertz/canvas/layout'; // Yoga integration

function Dashboard() {
  const stats = signal([
    { label: 'Users', value: 1234 },
    { label: 'Revenue', value: 5678 },
    { label: 'Growth', value: 90 }
  ]);
  
  return (
    <Canvas width={800} height={600}>
      <Flex
        direction="row"
        justify="space-around"
        align="center"
        padding={20}
        gap={20}
      >
        {stats().map(stat => (
          <Flex
            direction="column"
            align="center"
            padding={20}
            background={0x2196F3}
            borderRadius={8}
          >
            <Text
              text={stat.value.toString()}
              style={{ fontSize: 32, fill: 'white', fontWeight: 'bold' }}
            />
            <Text
              text={stat.label}
              style={{ fontSize: 16, fill: 'white' }}
            />
          </Flex>
        ))}
      </Flex>
    </Canvas>
  );
}
```

---

## Conclusion

**The research is clear:**

1. **Figma's approach** (custom C++/WASM renderer) is too heavy for a general framework. Learn from their optimizations, but don't copy their architecture.

2. **PixiJS is the best rendering backend.** It's mature, performant, and solves 80% of the hard problems. Building our own WebGL renderer would take years and deliver less value.

3. **Vertz's fine-grained reactivity is the perfect match for Canvas rendering.** No vdom diffing, direct signal → property updates. This is better than React's approach.

4. **Layout is the gap to fill.** PixiJS doesn't have layout. Start with manual positioning, add Yoga (flexbox) if needed.

5. **Accessibility requires hybrid approach.** Canvas-only isn't viable for general UIs. Use DOM for accessible content, Canvas for graphics.

6. **Bundle size is acceptable for target use cases.** ~460KB is fine for data viz, games, design tools. Not fine for content sites. Make it opt-in.

**Recommendation:** Build `@vertz/canvas` as a declarative wrapper over PixiJS, powered by vertz's signals. Start with a proof of concept (2-3 weeks), then decide whether to invest in a full MVP.

This approach leverages years of existing research and implementation work, rather than starting from zero. It's pragmatic, fast to market, and lets vertz focus on what makes it unique.

---

**Next:** Get approval from CTO, then start proof of concept. 🚀
