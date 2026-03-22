---
'@vertz/ui': patch
'@vertz/create-vertz-app': patch
---

Remove deprecated `ListTransition` component — use `<List animate>` instead

`ListTransition` and `ListTransitionProps` are no longer exported from `@vertz/ui`. Use `<List animate>` from `@vertz/ui/components`:

```tsx
// Before
import { ListTransition } from '@vertz/ui';

<ListTransition
  each={items}
  keyFn={(item) => item.id}
  children={(item) => <TodoItem task={item} />}
/>

// After
import { List } from '@vertz/ui/components';

<List animate>
  {items.map(item => (
    <List.Item key={item.id}>
      <TodoItem task={item} />
    </List.Item>
  ))}
</List>
```
