# Compiler Transparency and Debugging Guide

> **TL;DR:** The compiler transforms your code to make it reactive. `let` becomes a signal, `const` becomes computed, and JSX becomes DOM operations. This guide shows you exactly what happens and how to debug it.

---

## Why This Guide Exists

If you're reading this, you might have "compiler anxiety" — wondering what the compiler is doing to your code and whether you can trust it. **That's valid.** Automatic transformations can feel like magic, and magic can be scary when things break.

This guide removes the mystery. You'll see:
- **Exactly** what transformations happen
- **When** they happen (and when they don't)
- **How** to debug problems
- **What** can go wrong (and how to fix it)

---

## The Core Transformations

### 1. `let` → Signal (Read/Write Reactivity)

**What you write:**
```tsx
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
```

**What the compiler produces:**
```tsx
function Counter() {
  const count = signal(0);
  return (() => {
    const __el0 = __element("button");
    __on(__el0, "click", () => (count.peek()++, count.notify()));
    __el0.appendChild(__child(() => count.value));
    return __el0;
  })();
}
```

**Why:**
- `let count = 0` → `const count = signal(0)` — Wraps initial value in a signal
- `count` (read) → `count.value` — Unwraps the signal to get the current value
- `count++` (write) → `(count.peek()++, count.notify())` — Updates without triggering effects, then notifies subscribers

**When it happens:**
- ✅ Any `let` variable that's **read inside JSX** becomes a signal
- ✅ Any `let` variable that's **read by a `const` that's read inside JSX** becomes a signal
- ❌ `let` variables that are **never read reactively** stay plain variables

**Example — Plain `let` (NOT transformed):**
```tsx
function Demo() {
  let tempValue = 0; // Never read in JSX
  const doubled = 4; // Static value

  return <div>{doubled}</div>;
}
// Output: No transformations! tempValue and doubled stay as-is.
```

---

### 2. `const` → Computed (Derived Reactivity)

**What you write:**
```tsx
function Pricing() {
  let quantity = 1;
  const total = quantity * 10;
  const formatted = `$${total}`;
  return <div>{formatted}</div>;
}
```

**What the compiler produces:**
```tsx
function Pricing() {
  const quantity = signal(1);
  const total = computed(() => quantity.value * 10);
  const formatted = computed(() => `$${total.value}`);
  return (() => {
    const __el0 = __element("div");
    __el0.appendChild(__child(() => formatted.value));
    return __el0;
  })();
}
```

**Why:**
- `const total = quantity * 10` → `const total = computed(() => quantity.value * 10)`
- Computed values are **cached** and only recalculate when dependencies change
- Reading `quantity.value` inside the computed function makes it a dependency

**When it happens:**
- ✅ `const` that **reads a signal or computed** becomes computed
- ✅ `const` that **reads a `const` that's computed** becomes computed (transitive)
- ❌ `const` with **static values** stays static

**Example — Static `const` (NOT transformed):**
```tsx
function Demo() {
  const apiUrl = 'https://api.example.com'; // Static
  const maxRetries = 3; // Static
  return <div>{apiUrl}</div>;
}
// Output: No transformations! These are static values.
```

---

### 3. Mutations → `peek()` + `notify()`

**What you write:**
```tsx
function TodoList() {
  let items = ['one', 'two'];
  return <button onClick={() => items.push('three')}>Add</button>;
}
```

**What the compiler produces:**
```tsx
function TodoList() {
  const items = signal(['one', 'two']);
  return (() => {
    const __el0 = __element("button");
    __on(__el0, "click", () => (items.peek().push('three'), items.notify()));
    __el0.appendChild(document.createTextNode("Add"));
    return __el0;
  })();
}
```

**Why:**
- `items.push(...)` mutates the array **in place**
- `items.peek()` gets the raw array without subscribing
- `items.notify()` tells subscribers "the value changed"

**Supported mutations:**
- **Method calls:** `items.push('x')`, `user.update()`, `map.set('key', val)`
- **Property assignment:** `user.name = 'Bob'`
- **Index assignment:** `items[0] = 99`
- **Delete:** `delete config.debug`
- **Object.assign:** `Object.assign(user, { age: 30 })`

**When it happens:**
- ✅ When calling methods or assigning properties on a signal variable
- ❌ When assigning the **entire** variable (handled by signal write: `items = [...]`)

**Example — Full reassignment (NOT a mutation):**
```tsx
let items = ['a', 'b'];
items = ['c', 'd']; // ← This is items.value = [...], not a mutation
// Compiles to: items.value = ['c', 'd']
```

---

### 4. JSX → DOM Helpers

**What you write:**
```tsx
function Card({ title }) {
  return (
    <div className="card">
      <h2>{title}</h2>
    </div>
  );
}
```

**What the compiler produces:**
```tsx
function Card({ title }) {
  return (() => {
    const __el0 = __element("div");
    __el0.setAttribute("className", "card");
    const __el1 = __element("h2");
    __el1.appendChild(__child(() => title));
    __el0.appendChild(__el1);
    return __el0;
  })();
}
```

**Why:**
- JSX isn't valid JavaScript — the compiler transforms it into **imperative DOM operations**
- `<div>` → `__element("div")` creates an HTMLDivElement
- `{title}` → `__child(() => title)` wraps reactive expressions in an effect

**When expressions are reactive:**
- ✅ When the expression **reads a signal or computed**
- ✅ When the expression **calls a function that might read signals**
- ❌ Static strings, numbers, and literals are inserted directly (no effect overhead)

**Example — Static vs Reactive:**
```tsx
const static = "Hello";
let dynamic = "World";

<div>
  <span>{static}</span>    {/* → __insert(__el0, "Hello") — static */}
  <span>{dynamic}</span>   {/* → __child(() => dynamic.value) — reactive */}
</div>
```

---

### 5. Component Props → Getters (Reactive Props)

**What you write:**
```tsx
function Parent() {
  let name = 'Alice';
  return <Child name={name} age={30} />;
}
```

**What the compiler produces:**
```tsx
function Parent() {
  const name = signal('Alice');
  return Child({
    get name() { return name.value; }, // ← Reactive prop (getter)
    age: 30                             // ← Static prop
  });
}
```

**Why:**
- **Reactive props** use getters so the child component re-reads the value when it changes
- **Static props** are passed directly (no overhead)

**When props are reactive:**
- ✅ When the prop expression **reads a signal or computed**
- ❌ When the prop is a **literal** (`age={30}`) or **static const**

**Inside child components:**
```tsx
function Child(props) {
  // Reactive: props.name is a getter
  return <span>{props.name}</span>; // Reads props.name on every render

  // Static: props.age is a plain value
  return <span>{props.age}</span>; // Just a number
}
```

**⚠️ Don't destructure reactive props:**
```tsx
// ❌ BAD — Breaks reactivity
function Child({ name }) {
  return <span>{name}</span>; // name is now static!
}

// ✅ GOOD — Keep reactivity
function Child(props) {
  return <span>{props.name}</span>;
}
```

---

### 6. Conditionals → `__conditional()`

**What you write:**
```tsx
function Demo() {
  let show = true;
  return <div>{show ? <span>Yes</span> : <span>No</span>}</div>;
}
```

**What the compiler produces:**
```tsx
function Demo() {
  const show = signal(true);
  return (() => {
    const __el0 = __element("div");
    __el0.appendChild(
      __conditional(
        () => show.value,
        () => (() => {
          const __el1 = __element("span");
          __el1.appendChild(document.createTextNode("Yes"));
          return __el1;
        })(),
        () => (() => {
          const __el2 = __element("span");
          __el2.appendChild(document.createTextNode("No"));
          return __el2;
        })()
      )
    );
    return __el0;
  })();
}
```

**Why:**
- Ternaries (`a ? b : c`) and logical AND (`a && b`) need special handling to mount/unmount DOM nodes
- `__conditional()` efficiently swaps nodes when the condition changes

**Supported patterns:**
- **Ternary:** `{show ? <A /> : <B />}`
- **Logical AND:** `{show && <A />}`
- **Nested:** `{a ? (b ? <X /> : <Y />) : <Z />}`

---

### 7. Lists → `__list()`

**What you write:**
```tsx
function TodoList() {
  let items = ['a', 'b', 'c'];
  return <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>;
}
```

**What the compiler produces:**
```tsx
function TodoList() {
  const items = signal(['a', 'b', 'c']);
  return (() => {
    const __el0 = __element("ul");
    __list(
      __el0,
      () => items.value,
      (item) => item,
      (item) => (() => {
        const __el1 = __element("li");
        __el1.appendChild(document.createTextNode(item));
        return __el1;
      })()
    );
    return __el0;
  })();
}
```

**Why:**
- `.map()` needs reconciliation — efficiently add/remove/reorder nodes as the array changes
- `__list()` uses the `key` function to identify which nodes to reuse

**Key function:**
```tsx
// Explicit key prop
items.map(item => <li key={item.id}>{item.name}</li>)
// → keyFn: (item) => item.id

// No key prop (falls back to index)
items.map(item => <li>{item}</li>)
// → keyFn: (_item, __i) => __i
```

---

## When Transformations DON'T Happen

### ❌ Variables Never Read in JSX
```tsx
function Demo() {
  let temp = 0; // Never used in JSX
  console.log(temp);
  return <div>Hello</div>;
}
// Output: temp stays as `let temp = 0` (no transformation)
```

### ❌ Static Constants
```tsx
function Demo() {
  const API_URL = 'https://api.example.com';
  const MAX_RETRIES = 3;
  return <div>{API_URL}</div>;
}
// Output: Constants stay as-is (static insertion into JSX)
```

### ❌ Variables in Non-Component Functions
```tsx
function helperFn() {
  let x = 1; // Regular function, not a component
  return x + 1;
}
```

### ❌ Top-Level Variables
```tsx
let globalCounter = 0; // Module scope, not inside a component
function Counter() {
  globalCounter++; // No transformation
  return <div>{globalCounter}</div>;
}
```

---

## Debugging Workflow

### 1. Inspect the Compiled Output

**Vite Dev Server:**
When running `npm run dev`, the compiler runs as a Vite plugin. To see the transformed code:

**Option A: Browser DevTools**
1. Open DevTools (F12)
2. Go to **Sources** tab
3. Find your file (e.g., `src/components/Counter.tsx`)
4. The file shown is **after** compilation — you'll see `signal()`, `computed()`, and `__element()` calls

**Option B: Vite's Transform Debug**
Add this to your `vite.config.ts`:
```ts
export default defineConfig({
  plugins: [vertz()],
  optimizeDeps: {
    force: true // Force rebuild
  },
  build: {
    sourcemap: true // Enable source maps
  }
});
```

Then check `.vite/deps/` (dev) or `dist/` (build) for compiled output.

---

### 2. Use Source Maps

Source maps connect compiled code back to your original source. When an error occurs:

**In the browser console:**
```
Error: Cannot read property 'value' of undefined
  at Counter.tsx:5:20  ← This points to your ORIGINAL code
```

Click the link to jump to the source line.

**Disable source maps (if needed):**
```ts
// vite.config.ts
export default defineConfig({
  build: { sourcemap: false }
});
```

---

### 3. Check Compiler Diagnostics

The compiler emits **warnings** and **errors** during compilation:

**Example warning:**
```
[vertz] Warning: Destructuring reactive props breaks reactivity
  → src/components/Child.tsx:2:10
  function Child({ name }) {
                  ^^^^
  Suggestion: Use props.name instead
```

**Example error:**
```
[vertz] Error: Unsupported mutation pattern
  → src/components/Demo.tsx:5:3
  items.sort().reverse();
  ^^^^^^^^^^^^^^^^^^^^^
  Reason: Chained mutations are ambiguous
  Fix: Split into separate statements
```

**Where to see diagnostics:**
- **Dev server:** Printed in the terminal where `npm run dev` is running
- **Build:** Printed during `npm run build`
- **Editor (with LSP):** Red squiggles in VS Code / your editor

---

### 4. Debugging Reactivity Issues

**Problem: "My UI doesn't update when the variable changes"**

**Check 1: Is the variable a signal?**
```tsx
let count = 0; // Should become signal(0)
return <div>{count}</div>; // Should become count.value
```

**How to verify:**
- Check browser DevTools → Sources → see if `signal(0)` appears
- Add `console.log(count)` — if it logs `{ value: 0, peek: fn, notify: fn }`, it's a signal

**Check 2: Are you reading `.value` in an effect?**
Signals only trigger updates when read inside:
- JSX expressions: `{count}` → wrapped in `__child(() => count.value)`
- `effect()`: `effect(() => console.log(count.value))`

**Check 3: Did you destructure props?**
```tsx
// ❌ Breaks reactivity
function Child({ name }) {
  return <div>{name}</div>;
}

// ✅ Keeps reactivity
function Child(props) {
  return <div>{props.name}</div>;
}
```

---

**Problem: "Too many updates / infinite loop"**

**Cause:** Reading and writing the same signal inside an effect:
```tsx
effect(() => {
  count.value = count.value + 1; // ❌ Triggers itself
});
```

**Fix:** Use `untrack()` to read without subscribing:
```tsx
effect(() => {
  const current = untrack(() => count.value);
  count.value = current + 1; // Safe
});
```

Or use `batch()` to group updates:
```tsx
batch(() => {
  count.value++;
  total.value = count.value * 10;
}); // Triggers effects only once
```

---

**Problem: "Mutation doesn't trigger updates"**

**Example:**
```tsx
let items = [1, 2, 3];
items.push(4); // UI doesn't update
```

**Check 1: Is `items` a signal?**
If `items` is never read in JSX, it won't be transformed.

**Fix:** Make sure it's read somewhere:
```tsx
return <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>;
```

**Check 2: Are you reassigning instead of mutating?**
```tsx
items = [...items, 4]; // ← This is signal write, not mutation
// Compiles to: items.value = [...items, 4]
```

**Check 3: Unsupported mutation?**
Chained mutations aren't supported:
```tsx
// ❌ Unsupported
items.sort().reverse();

// ✅ Supported
items.sort();
items.reverse();
```

---

### 5. Common Error Messages

#### `Cannot read property 'value' of undefined`

**Cause:** Trying to read `.value` on something that's not a signal.

**Example:**
```tsx
const name = 'Alice'; // Static const
return <div>{name.value}</div>; // ❌ Error
```

**Fix:** Remove `.value` — the compiler only adds it for signals:
```tsx
const name = 'Alice';
return <div>{name}</div>; // ✅ Works
```

---

#### `signal is not defined`

**Cause:** Missing import from `@vertz/ui`.

**Fix:** The compiler auto-adds imports, but if you're using signals manually:
```tsx
import { signal, computed, effect } from '@vertz/ui';
```

---

#### `Identifier 'props' has already been declared`

**Cause:** Naming conflict with compiler-generated variables.

**Fix:** Avoid variable names starting with `__` (reserved for compiler internals):
```tsx
// ❌ Avoid
let __temp = 0;

// ✅ Use
let temp = 0;
```

---

## What Could Go Wrong (Common Pitfalls)

### 1. Destructuring Props

**❌ Problem:**
```tsx
function Greeting({ name }) {
  return <h1>Hello, {name}</h1>;
}
```

**Why it fails:**
- Props are passed as getters: `{ get name() { return nameSignal.value; } }`
- Destructuring evaluates the getter **once** and captures the value
- Later changes to `name` won't propagate

**✅ Solution:**
```tsx
function Greeting(props) {
  return <h1>Hello, {props.name}</h1>;
}
```

**Compiler warning:**
The compiler emits a warning if it detects this pattern.

---

### 2. Reading Signals Outside Effects

**❌ Problem:**
```tsx
let count = 0;
const doubled = count * 2; // Evaluated once at component mount
console.log(doubled); // Doesn't update when count changes
```

**Why it fails:**
- `const doubled = count * 2` becomes `const doubled = computed(() => count.value * 2)`
- But `console.log(doubled)` happens at mount, not reactively

**✅ Solution A (if you need reactivity):**
```tsx
let count = 0;
const doubled = count * 2; // Computed
return <div>{doubled}</div>; // ✅ Reactively reads doubled.value
```

**✅ Solution B (if you want side effects):**
```tsx
let count = 0;
effect(() => {
  console.log(count); // ✅ Runs every time count changes
});
```

---

### 3. Modifying Signal Internals Directly

**❌ Problem:**
```tsx
let items = [1, 2, 3];
items.value.push(4); // Mutates but doesn't notify
```

**Why it fails:**
- `.value` returns the raw array
- Mutating it bypasses `notify()`, so subscribers aren't informed

**✅ Solution:**
```tsx
items.push(4); // ✅ Compiler transforms to (items.peek().push(4), items.notify())
```

---

### 4. Chaining Mutations

**❌ Problem:**
```tsx
items.sort().reverse(); // Ambiguous transformation
```

**Why it fails:**
- The compiler can't determine if both `sort()` and `reverse()` should trigger `notify()`

**✅ Solution:**
```tsx
items.sort();
items.reverse();
```

---

### 5. Using `let` for Non-Reactive State

**❌ Problem:**
```tsx
function Demo() {
  let tempValue = 0; // Never read in JSX
  // ...lots of code...
  return <div>Hello</div>;
}
```

**Why it's wasteful:**
- If `tempValue` is never read in JSX, it shouldn't be reactive
- The compiler won't transform it, but using `let` might confuse readers

**✅ Solution:**
```tsx
const tempValue = 0; // Clearly non-reactive
```

---

### 6. Top-Level Reactive State

**❌ Problem:**
```tsx
let globalCounter = 0; // Module scope

function Counter() {
  return <button onClick={() => globalCounter++}>
    {globalCounter}
  </button>;
}
```

**Why it fails:**
- Top-level variables aren't analyzed for reactivity (only component function bodies)

**✅ Solution:**
```tsx
import { signal } from '@vertz/ui';

const globalCounter = signal(0); // Explicit signal

function Counter() {
  return <button onClick={() => globalCounter.value++}>
    {globalCounter.value}
  </button>;
}
```

---

### 7. Mixing Compiler Reactivity with Explicit Signals

**❌ Problem:**
```tsx
import { signal } from '@vertz/ui';

function Demo() {
  const count = signal(0); // Explicit signal
  const doubled = count.value * 2; // ❌ Reads .value once

  return <div>{doubled}</div>;
}
```

**Why it fails:**
- `const doubled = count.value * 2` evaluates `count.value` once (at mount)
- It doesn't become a computed because `count` is already a signal (not a compiler-managed `let`)

**✅ Solution A (use compiler reactivity):**
```tsx
function Demo() {
  let count = 0; // Let compiler manage it
  const doubled = count * 2; // ✅ Becomes computed
  return <div>{doubled}</div>;
}
```

**✅ Solution B (explicit computed):**
```tsx
import { signal, computed } from '@vertz/ui';

function Demo() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2); // ✅ Explicit computed
  return <div>{doubled.value}</div>;
}
```

---

## FAQ

### Q: Can I see the compiled output?

**A:** Yes! Check your browser DevTools → Sources tab. The file shown is post-compilation.

Alternatively, use Vite's build output:
```bash
npm run build
cat dist/assets/Counter-*.js # See compiled code
```

---

### Q: Can I disable compiler transformations?

**A:** No. The compiler is required for reactivity. Without transformations, `let` and `const` are just plain variables.

If you need explicit control, use signals directly:
```tsx
import { signal, computed } from '@vertz/ui';

const count = signal(0);
const doubled = computed(() => count.value * 2);
```

---

### Q: Do transformations affect performance?

**A:** The transformations happen at **build time**, not runtime. The compiled code has **zero overhead** compared to writing signals/computed manually.

In fact, the compiler **optimizes** by detecting static values and skipping unnecessary wrappers.

---

### Q: What if the compiler gets it wrong?

**A:** Report it! Compiler bugs are high priority. File an issue with:
- Your original code
- The compiled output (from DevTools)
- Expected vs actual behavior

Workaround: Use explicit signals as a fallback:
```tsx
import { signal } from '@vertz/ui';
const count = signal(0); // Explicit, bypasses compiler
```

---

### Q: Can I use `var` instead of `let`?

**A:** No. `var` is not analyzed by the compiler. Use `let` for reactive state, `const` for derived/static state.

---

### Q: Does the compiler work with TypeScript?

**A:** Yes! The compiler analyzes TypeScript AST and preserves all type information. Types are stripped during the build (standard TS→JS process).

---

### Q: Can I debug with `console.log()`?

**A:** Yes, but signals log as objects:
```tsx
let count = 0;
console.log(count); // Logs: { value: 0, peek: [Function], notify: [Function] }
```

To log the value:
```tsx
console.log(count.value); // Logs: 0
```

---

### Q: How do I test components that use compiler reactivity?

**A:** Use Vitest or your test framework as usual. The compiler runs during the test build.

**Tip:** Test behavior, not implementation. Don't assert on `.value` — assert on DOM output:
```tsx
import { render } from '@vertz/ui/test-utils';

test('counter increments', () => {
  const { container, click } = render(Counter);
  expect(container.textContent).toBe('0');
  
  click('button');
  expect(container.textContent).toBe('1');
});
```

---

### Q: Can I use the compiler with other frameworks?

**A:** No. The compiler is tightly coupled to `@vertz/ui` runtime APIs (`signal`, `computed`, `__element`, etc.).

For React/Vue/Svelte, use their native reactivity systems.

---

## Troubleshooting Checklist

When something breaks, check these in order:

1. **Check browser console** for errors
2. **Check terminal** (dev server) for compiler warnings
3. **Inspect DevTools → Sources** to see compiled code
4. **Verify signal creation:** Is the `let` being read in JSX?
5. **Check prop usage:** Are you destructuring reactive props?
6. **Check mutation pattern:** Are you using supported mutation syntax?
7. **Check effect scope:** Are you reading signals inside effects or JSX?
8. **Simplify:** Remove code until it works, then add back to isolate the issue
9. **Read the error:** Compiler errors include suggestions
10. **Search issues:** https://github.com/vertz-dev/vertz/issues

---

## Summary

The compiler makes reactivity feel invisible, but it's not magic — it's **predictable transformations** applied at build time:

| You Write | Compiler Produces | Why |
|-----------|-------------------|-----|
| `let x = 0` | `const x = signal(0)` | Read/write reactivity |
| `const y = x * 2` | `const y = computed(() => x.value * 2)` | Derived value, cached |
| `x++` | `(x.peek()++, x.notify())` | Mutation with notification |
| `{x}` in JSX | `__child(() => x.value)` | Reactive expression |
| `<div>` | `__element("div")` | DOM creation |
| `{a ? <X/> : <Y/>}` | `__conditional(...)` | Conditional rendering |
| `{items.map(...)}` | `__list(...)` | List rendering |

**Trust, but verify.** Use DevTools to inspect compiled code. Use diagnostics to catch issues early. And when in doubt, write explicit signals for full control.

Happy debugging! 🐛
