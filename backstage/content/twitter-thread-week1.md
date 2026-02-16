# Week 1 Twitter Thread — UI Reveal

**Theme:** The UI layer — signal-based reactivity, no virtual DOM, type-safe from schema to screen.

---

**Tweet 1 (Hook):**
```
What if your UI just... worked?

No VDOM. No diffing. No "why isn't this re-rendering?" mysteries.

Just signals. Fine-grained updates. Types that flow from your schema to your components.

Here's what 2 years of rethinking UI looks like 🧵
```

---

**Tweet 2 (The problem):**
```
Traditional frameworks made a trade-off: easy ergonomics via VDOM, paid for in runtime overhead and unpredictable re-renders.

For LLMs, there's a worse problem: they can't see what will happen. The runtime decides. 

We needed a different model.
```

---

**Tweet 3 (The solution — code):**
```
Your component, simplified:

```tsx
const UserCard = component(({ user }) => {
  return (
    <div class="card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      <Badge status={user.subscription} />
    </div>
  )
})
```

That's it. No hooks. No deps arrays. No memo.
```

---

**Tweet 4 (Why signals):**
```
We chose signals because:

1. Updates are surgical — only the text node changes, not the whole component tree
2. Types flow naturally — no "any" workarounds for refs or effects  
3. LLMs can trace it — no invisible runtime scheduling

VDOM is a brilliant hack. It's also why your debugger is a maze.
```

---

**Tweet 5 (The type safety story — code):**
```
Here's the part that matters for LLM-native development:

```typescript
// Define once in your schema
type User = schema.User

// Automatic form validation
const Form = component(({ onSubmit }) => {
  const { fields, errors, submit } = useForm<User>()
  
  return <form onSubmit={submit(onSubmit)}>
    <Input field={fields.name} />
    {errors.name && <span>{errors.name}</span>}
  </form>
})
```

The form knows your schema. Your schema knows your DB.
```

---

**Tweet 6 (The differentiator):**
```
Most frameworks give you type-safe components.

Vertz gives you type-safe *everything*:

Schema → Database → API → Client → UI

One type system. Zero seams. If it builds, it works.

Your LLM teammate sees the whole picture. Not just the frontend.
```

---

**Tweet 7 (CTA):**
```
The UI layer is live.

```bash
npm create vertz@latest
```

Docs: https://docs.vertz.dev

Star us: https://github.com/vertz-io/vertz

Week 2: What's next? 🌍
```

---

## Thread Flow Summary

1. **Hook** — Challenge assumptions about VDOM
2. **Problem** — VDOM's hidden costs for humans AND LLMs
3. **Solution** — Code snippet showing simplicity
4. **Why Signals** — Technical reasoning (traceability, types, performance)
5. **Type Safety** — Code showing schema-to-UI flow
6. **Differentiation** — The stack story (schema to browser)
7. **CTA** — npm, docs, GitHub, what's next

---

## Tone Notes

- Confident, not hype-y
- Technical substance over marketing
- Code speaks for itself
- Think Linear / Vercel / Stripe announcements
- No emoji in code blocks
- Short sentences, clear points
