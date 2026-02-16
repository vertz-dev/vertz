# Week 1 Blog Post Outline — UI & Reactivity

**Target length:** ~1500 words
**Purpose:** Announce the UI layer, explain the technical decisions, demonstrate the DX

---

## Title Options

1. **"Rethinking Reactivity: Why Vertz Chose Signals Over VDOM"**
2. **"The End of the Re-render Mystery: Signal-Based UI in Vertz"**
3. **"Type-Safe from Schema to Screen: Building Vertz's UI Layer"**

*Recommendation: Option 1 — plays well to technical audience, signals keyword helps discoverability*

---

## Section Outline

### 1. The Problem with Modern UI (150 words)

- Frameworks made UI easier but introduced hidden complexity
- VDOM: brilliant runtime solution, terrible debugging experience
- The "what triggered this re-render?" problem
- For LLMs: VDOM is opaque — they can't see what the runtime will do
- We needed a model where the code *is* the execution plan

### 2. Signals: The Compilation-Friendly Alternative (250 words)

- What signals are (quick refresher for readers)
- Why they work better for build-time analysis
- Fine-grained updates vs tree diffing
- Auto-tracking: effect(() => { read(data) }) — compiler sees the read, runtime subscribes
- Code example: simple counter with signals

```tsx
const Counter = component(() => {
  const count = signal(0)
  
  return (
    <button onClick={() => count.value++}>
      Clicks: {count}
    </button>
  )
})
```

### 3. Type Safety End-to-End (300 words)

- The Vertz promise: one type system from schema to UI
- Define your schema once → gets database table, API contract, client types, form validation
- Code example: schema-driven form

```typescript
// schema.ts
export const User = schema.object({
  id: schema.string(),
  name: schema.string().min(2),
  email: schema.string().email(),
  role: schema.enum(['admin', 'user', 'guest'])
})

// component.tsx
const UserForm = component(({ onSubmit }) => {
  const { fields, errors, submit } = useForm(User)
  return <form onSubmit={submit(onSubmit)}>...</form>
})
```

- The form *knows* the schema. The API *knows* the schema. The DB *knows* the schema.
- No manual wiring. No "type cast any" workarounds.
- LLMs see the full chain — not just the frontend

### 4. What We Cut (200 words)

- No useEffect dependency arrays (guessing game)
- No useMemo/useCallback (premature optimization API)
- No context providers (implicit dependency injection)
- No "render props" or "children as function"
- Everything explicit, everything traceable, everything type-checked

*Explain the philosophy: we're not reducing features, we're removing ambiguity*

### 5. Performance by Default (200 words)

- No VDOM diffing overhead
- Updates scale with actual changes, not tree size
- Cold starts: compiled, not interpreted
- Benchmarks to include (or note: benchmarks coming in follow-up post)
- "Performance is not optional" — it's a design principle, not an afterthought

### 6. What's Next (150 words)

- This is Week 1 of the Vertz progressive reveal
- UI layer is live in alpha
- Week 2: database layer (schema → table, zero ORM friction)
- The vision: full-stack, one type system, no seams

### 7. Get Started (100 words)

- npm install / npm create vertz@latest
- Link to docs
- Link to GitHub
- "If it builds, it works"

---

## Code Examples to Include

| # | Example | Purpose |
|---|---------|---------|
| 1 | Simple signal counter | Show basic syntax, no magic |
| 2 | Schema-driven form | Demonstrate end-to-end types |
| 3 | Component with derived state | Show computed signals |

---

## Key Messages (for wrapping)

- Signals aren't new — but signals *with compile-time guarantees* are
- Type safety isn't just for the backend anymore
- "If it builds, it works" applies to UI too
- Built for LLMs: every layer speaks the same language

---

## Word Count Estimate

- Section 1: 150
- Section 2: 250
- Section 3: 300
- Section 4: 200
- Section 5: 200
- Section 6: 150
- Section 7: 100

**Total: ~1350 words** (room for intro/outro transitions = 1500)
