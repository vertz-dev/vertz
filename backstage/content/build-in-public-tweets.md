# Build-in-Public Tweet Series

5 standalone tweets — behind-the-scenes, technical substance, not just announcements.

---

**Tweet 1:**
```
We rewrote our reactivity system 3 times before shipping.

First: dirty-checking (too slow)
Second: explicit dependency tracking (too verbose)
Third: signals with auto-tracking

The lesson? The simple solution was right all along. We just hadn't found the simple version yet.
```

---

**Tweet 2:**
```
Here's why we chose signals over virtual DOM:

```tsx
// In VDOM: component re-runs, diffs entire tree, patches changes
// In signals: only the text node updates
```

For LLM-native dev, this matters: signals are *traceable*. The data flow is visible in the code, not hidden in a scheduler.

What you see is what executes.
```

---

**Tweet 3:**
```
We killed the dependency array.

```tsx
// Old way (hooks)
useEffect(() => {
  fetchData(user.id)
}, [user.id]) // what goes here? what if I forget?

// Our way (effects auto-track)
effect(() => {
  fetchData(user.id) // reads user.id → auto-subscribes
})
```

No guessing. The compiler sees what you read, so the runtime knows what changed.
```

---

**Tweet 4:**
```
The compiler catches what the runtime never could.

When we designed Vertz, we asked: "What if API errors surfaced at build time?"

Now your schema validates against your routes. Your routes validate against your client. One type system from end to end.

If it builds, it works.
```

---

**Tweet 5:**
```
We built Vertz because watching LLMs get NestJS decorators wrong was painful.

Wrong order. Missing imports. Runtime failures that TypeScript couldn't see.

Our bet: explicit > implicit, compile-time > runtime, one way > many ways.

It's harder to write. Easier for AI to get right.
```

---

## Posting Strategy

- Space these out 2-3 days apart
- Pair with demos or code screenshots when possible
- Engage with replies that ask technical questions
- Link back to docs where relevant
- Keep the "we're building in public" vibe — honest, not polished
