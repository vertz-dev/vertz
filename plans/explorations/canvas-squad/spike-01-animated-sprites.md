# Spike 01: Animated Sprites with Signals

**Owner:** kai  
**Duration:** 3-5 days  
**Status:** Ready to Start  
**Branch:** `explore/canvas-renderer`

---

## Objective

Prove that **vertz signals + PixiJS = smooth, performant Canvas rendering** with minimal friction.

Build the simplest possible integration: 100 sprites bouncing around, positions driven by signals, updating at 60fps.

---

## Success Criteria

**Must have:**
- [x] `<Canvas>` component renders a PixiJS Application
- [x] `<Sprite x={signal.x} y={signal.y} texture="bunny.png" />` creates a PIXI.Sprite
- [x] Signal changes update PixiJS properties WITHOUT full component re-render
- [x] 100 sprites animating at 60fps on mid-range laptop
- [x] Code feels natural (declarative JSX, signals work like normal vertz)

**Nice to have:**
- Interactive (click to spawn new sprite)
- Performance metrics displayed (FPS counter)
- Multiple textures (variety)

**Explicitly out of scope:**
- Layout engine
- Accessibility
- TypeScript definitions (use `any` for now)
- Tests (just get it working first)
- Documentation

---

## Deliverables

1. **Package structure:**
   ```
   packages/canvas/
   ├── src/
   │   ├── components/
   │   │   ├── Canvas.tsx          # Root component
   │   │   ├── Sprite.tsx          # Sprite wrapper
   │   │   └── Container.tsx       # Grouping (optional)
   │   ├── hooks/
   │   │   └── useTicker.ts        # Animation loop
   │   ├── runtime/
   │   │   ├── create-app.ts       # PixiJS app initialization
   │   │   └── bind-signal.ts      # Wire signals to PixiJS props
   │   └── index.ts
   ├── examples/
   │   └── 01-animated-sprites/
   │       ├── index.html
   │       └── App.tsx             # The demo
   └── package.json
   ```

2. **Demo app:**
   - 100 sprites (bunnies or circles)
   - Each has position signal (x, y)
   - `useTicker` hook updates positions every frame
   - Bounce off walls (simple physics)
   - FPS counter in corner

3. **Screen recording:**
   - 30-second video showing smooth animation
   - Show code (JSX) alongside running demo
   - Highlight signal updates in DevTools (if possible)

4. **Brief report:**
   - What worked well
   - What was awkward
   - Any blockers or surprises
   - Estimated bundle size

---

## Architecture Hints

### Canvas Component (Pseudo-code)

```tsx
// packages/canvas/src/components/Canvas.tsx
import * as PIXI from 'pixi.js';
import { onMount, onCleanup, children } from 'vertz';

export function Canvas(props: {
  width: number;
  height: number;
  background?: string;
  children: any;
}) {
  let canvasEl: HTMLCanvasElement;
  let app: PIXI.Application;

  onMount(() => {
    app = new PIXI.Application({
      width: props.width,
      height: props.height,
      view: canvasEl,
      backgroundColor: props.background || '#1099bb',
    });

    // Render children into PixiJS stage
    const childNodes = children(() => props.children);
    // TODO: How to convert vertz components → PixiJS display objects?
    // This is the core challenge.
  });

  onCleanup(() => {
    app.destroy(true);
  });

  return <canvas ref={canvasEl} />;
}
```

**Challenge:** How do child components get access to `app.stage`?

**Options:**
1. **Context:** Provide `app` via context, children access it
2. **Direct parent-child:** Canvas component manually creates PixiJS objects for children
3. **Custom renderer:** Similar to React's reconciler (overkill for spike)

**Recommendation for spike:** Use context. Keep it simple.

---

### Sprite Component (Pseudo-code)

```tsx
// packages/canvas/src/components/Sprite.tsx
import * as PIXI from 'pixi.js';
import { effect, onCleanup, useContext } from 'vertz';

export function Sprite(props: {
  x: number | (() => number);  // Static or signal
  y: number | (() => number);
  texture: string;
  rotation?: number | (() => number);
}) {
  const app = useContext(CanvasContext); // Get PixiJS app from context
  
  const sprite = new PIXI.Sprite(PIXI.Texture.from(props.texture));
  app.stage.addChild(sprite);

  // Wire up reactive properties
  // If prop is a function (signal getter), create effect
  if (typeof props.x === 'function') {
    effect(() => { sprite.x = props.x(); });
  } else {
    sprite.x = props.x;
  }

  if (typeof props.y === 'function') {
    effect(() => { sprite.y = props.y(); });
  } else {
    sprite.y = props.y;
  }

  // Same for rotation, scale, etc.

  onCleanup(() => {
    sprite.destroy();
  });

  // Return nothing? Or a placeholder?
  // PixiJS renders to canvas, not DOM.
  return null;
}
```

**Key insight:** Detect if prop is a function (signal getter) vs. static value. Create effect only for dynamic props.

---

### useTicker Hook (Pseudo-code)

```tsx
// packages/canvas/src/hooks/useTicker.ts
import { useContext, onCleanup } from 'vertz';

export function useTicker(callback: (delta: number) => void) {
  const app = useContext(CanvasContext);
  
  const ticker = (delta: number) => {
    callback(delta);
  };
  
  app.ticker.add(ticker);
  
  onCleanup(() => {
    app.ticker.remove(ticker);
  });
}
```

**Usage in component:**

```tsx
const x = signal(100);
const y = signal(100);
const vx = 2;
const vy = 3;

useTicker((delta) => {
  // Update position
  x.update(val => {
    const newX = val + vx * delta;
    if (newX < 0 || newX > 800) vx *= -1; // Bounce
    return newX;
  });
  
  y.update(val => {
    const newY = val + vy * delta;
    if (newY < 0 || newY > 600) vy *= -1;
    return newY;
  });
});

return <Sprite x={x()} y={y()} texture="bunny.png" />;
```

---

### Demo App (Pseudo-code)

```tsx
// examples/01-animated-sprites/App.tsx
import { Canvas, Sprite } from '@vertz/canvas';
import { signal } from 'vertz';
import { useTicker } from '@vertz/canvas';

function BouncingSprite(props: { id: number }) {
  const x = signal(Math.random() * 800);
  const y = signal(Math.random() * 600);
  const vx = signal((Math.random() - 0.5) * 5);
  const vy = signal((Math.random() - 0.5) * 5);

  useTicker((delta) => {
    x.update(val => {
      const newX = val + vx() * delta;
      if (newX < 0 || newX > 800) vx.update(v => v * -1);
      return newX;
    });

    y.update(val => {
      const newY = val + vy() * delta;
      if (newY < 0 || newY > 600) vy.update(v => v * -1);
      return newY;
    });
  });

  return <Sprite x={x()} y={y()} texture="bunny.png" />;
}

export function App() {
  const sprites = Array.from({ length: 100 }, (_, i) => i);

  return (
    <Canvas width={800} height={600} background="#1099bb">
      {sprites.map(id => <BouncingSprite key={id} id={id} />)}
    </Canvas>
  );
}
```

---

## Resources

**PixiJS Docs:**
- Getting Started: https://pixijs.com/guides/basics/getting-started
- Sprites: https://pixijs.com/guides/basics/sprites
- Application: https://pixijs.com/guides/basics/application

**Bunny Texture:**
Use PixiJS's sample bunny: `https://pixijs.com/assets/bunny.png`

**Vertz Patterns:**
- Signals: `signal(initialValue)` → `.get()`, `.set(newValue)`, `.update(fn)`
- Effects: `effect(() => { /* runs when dependencies change */ })`
- Lifecycle: `onMount(() => {})`, `onCleanup(() => {})`

---

## Questions to Answer

As you build this, keep notes on:

1. **Does the API feel natural?**
   - Is `<Sprite x={x()} />` intuitive?
   - Are there rough edges? (syntax, concepts, etc.)

2. **How's performance?**
   - Smooth 60fps with 100 sprites?
   - What about 1000 sprites?
   - Memory usage stable? (check DevTools)

3. **Any surprises?**
   - Did PixiJS do something unexpected?
   - Were signals harder to wire up than expected?
   - Build system issues?

4. **What's missing?**
   - What would you need to build a real app?
   - What felt tedious or repetitive?

---

## Timeline

**Day 1:**
- Set up package structure
- Install PixiJS (`npm install pixi.js`)
- Get basic `<Canvas>` rendering (empty PixiJS app)

**Day 2:**
- Implement `<Sprite>` component
- Wire up signal → property binding
- Get ONE sprite rendering with reactive position

**Day 3:**
- Implement `useTicker` hook
- Build 100-sprite demo
- Test performance, tweak if needed

**Day 4:**
- Polish demo (FPS counter, interactivity)
- Record screen capture
- Write brief report

**Day 5 (buffer):**
- Code cleanup
- Prepare for team review
- Answer questions from roadmap

---

## Definition of Done

- [ ] Code compiles and runs
- [ ] Demo shows 100 smooth sprites (60fps)
- [ ] Screen recording shared with team
- [ ] Brief report written (see "Questions to Answer")
- [ ] Code pushed to `explore/canvas-renderer` branch
- [ ] Ready for team review / Go-No-Go discussion

---

## If You Get Stuck

**Reach out immediately. Don't thrash alone.**

- edson: Build/packaging issues
- josh: API design questions
- riley: Scope questions, priority calls

**Common pitfalls:**
- PixiJS needs `view` or `canvas` element passed to Application
- Textures must be loaded before rendering (use PIXI.Assets.load)
- Effect cleanup is critical (or you'll have memory leaks)

---

## Final Note

This is a **spike**, not production code. It's okay if it's messy. The goal is to learn:

✅ Does this approach work?  
✅ Does it feel good?  
✅ Are there dealbreakers?

If the answer is "yes, yes, no" → we move to Phase 2.  
If any answer is different → we reassess.

**Good luck! Let's see if this PixiJS + signals thing is as cool as josh's research suggests.** 🚀

— riley
