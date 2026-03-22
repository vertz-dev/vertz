---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
'@vertz/create-vertz-app': patch
---

Remove `queryMatch` primitive — use direct conditional rendering instead

`queryMatch()` has been removed. Replace with direct conditionals on query signal properties:

```tsx
// Before
{queryMatch(tasks, {
  loading: () => <Spinner />,
  error: (err) => <Error error={err} />,
  data: (data) => <List items={data.items} />,
})}

// After
{tasks.loading && <Spinner />}
{tasks.error && <Error error={tasks.error} />}
{tasks.data && <List items={tasks.data.items} />}
```
