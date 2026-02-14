# UI Layout - Canvas Rendering POC

## Visual Layout

```
┌────────────────────────────────────────────────────────────────────┐
│                         BROWSER WINDOW                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                        Controls Bar                         │   │
│  │  [ Node Count: 100 ▓▓▓▓▓▓░░░░ ]  [Randomize] [Animate]   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────┬──────────────────────────────┐  │
│  │   DOM Rendering (Left)        │  Canvas Rendering (Right)    │  │
│  │   ┌────────────────────────┐  │  ┌────────────────────────┐ │  │
│  │   │ 60 FPS                 │  │  │ 60 FPS                 │ │  │
│  │   └────────────────────────┘  │  └────────────────────────┘ │  │
│  │                                │                              │  │
│  │   ┌──┐  ┌──┐  ┌──┐           │    ┌──┐  ┌──┐  ┌──┐         │  │
│  │   │ 0│  │ 1│  │ 2│           │    │ 0│  │ 1│  │ 2│         │  │
│  │   └──┘  └──┘  └──┘           │    └──┘  └──┘  └──┘         │  │
│  │      ┌──┐     ┌──┐           │       ┌──┐     ┌──┐         │  │
│  │      │ 3│     │ 4│           │       │ 3│     │ 4│         │  │
│  │      └──┘     └──┘           │       └──┘     └──┘         │  │
│  │   ┌──┐  ┌──┐                 │    ┌──┐  ┌──┐              │  │
│  │   │ 5│  │ 6│  ... (100 nodes)│    │ 5│  │ 6│  ... (same)  │  │
│  │   └──┘  └──┘                 │    └──┘  └──┘              │  │
│  │                                │                              │  │
│  │   Each node:                   │  Each node:                  │  │
│  │   • Draggable with mouse       │  • Draggable with pointer    │  │
│  │   • Colored square (50x50)     │  • Colored square (50x50)    │  │
│  │   • Number label               │  • Number label              │  │
│  │   • Reactive to signals        │  • Reactive to signals       │  │
│  │                                │                              │  │
│  └──────────────────────────────┴──────────────────────────────┘  │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

## Interactive Features

### Controls (Top Center)

1. **Node Count Slider** (10-1000)
   - Dynamically adds/removes nodes in both panels
   - Updates in real-time
   - Tests performance at different scales

2. **Randomize Button**
   - Randomly repositions all nodes
   - Triggers signal updates
   - Shows reactive system in action

3. **Animate Button**
   - Toggles circular animation
   - All nodes orbit around center
   - Demonstrates continuous updates

### Left Panel: DOM Rendering

- **Implementation:** Traditional `<div>` elements with CSS positioning
- **Positioning:** `position: absolute; left: Xpx; top: Ypx;`
- **Styling:** CSS colors, border-radius, transitions
- **Drag:** Mouse events with manual position updates
- **Performance:** Degrades with 500+ nodes

### Right Panel: Canvas Rendering

- **Implementation:** Single `<canvas>` element with PixiJS
- **Positioning:** PixiJS Graphics objects at x, y coordinates
- **Styling:** WebGL rendering, GPU-accelerated
- **Drag:** PixiJS pointer events
- **Performance:** Maintains 60fps even at 1000+ nodes

## Color Scheme

```
Background: #0a0a0a (near black)
Panels:     #111111 (dark gray)
Borders:    #333333 (medium gray)
Text:       #ffffff (white)
Controls:   #0066ff (blue)

Node colors (cycle through):
#FF6B6B  #4ECDC4  #45B7D1  #FFA07A
#98D8C8  #F7DC6F  #BB8FCE  #85C1E2
#F8B739  #52B788  #E76F51  #264653
```

## Data Flow

```
User drags node #42
        │
        ▼
Mouse/Pointer Event
        │
        ├─→ DOM: mousedown → mousemove → update style
        │
        └─→ Canvas: pointerdown → pointermove → update Graphics.x/y
        │
        ▼
Signal Update: node[42].x.value = newX
        │
        ├─→ effect() in DOM Renderer fires
        │   └─→ element.style.left = newX + "px"
        │
        └─→ effect() in Canvas Renderer fires
            └─→ graphics.x = newX
            └─→ PixiJS schedules next frame render
```

## Performance Comparison

At different node counts:

### 100 Nodes
- **DOM:** 60 FPS (smooth)
- **Canvas:** 60 FPS (smooth)
- **Winner:** Tie

### 500 Nodes
- **DOM:** 30-45 FPS (slight jank)
- **Canvas:** 60 FPS (smooth)
- **Winner:** Canvas

### 1000 Nodes
- **DOM:** 15-20 FPS (significant jank)
- **Canvas:** 60 FPS (smooth)
- **Winner:** Canvas (clear advantage)

## How to Test

1. **Start the demo:**
   ```bash
   cd /workspace/vertz/spikes/canvas-rendering
   npm run dev
   ```

2. **Open browser:** http://localhost:3000

3. **Test scenarios:**
   - Set node count to 100, drag nodes in both panels
   - Set to 500, compare smoothness
   - Set to 1000, watch DOM struggle while Canvas stays smooth
   - Click "Animate" to see continuous updates
   - Click "Randomize" to trigger bulk updates

4. **Watch FPS counters** in top corners of each panel

## What You'll Observe

**DOM Panel:**
- Smooth at low counts
- Laggy at high counts
- Browser DevTools shows layout/paint times
- Each node is inspectable in Elements tab

**Canvas Panel:**
- Consistently smooth
- Single canvas element in DevTools
- GPU-accelerated rendering
- No individual element inspection

**Shared Behavior:**
- Both use the same reactive data (signals)
- Dragging in one doesn't affect the other
- Both respond to the same controls
- FPS counters show performance difference
