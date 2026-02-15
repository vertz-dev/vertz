# @vertz/tui

Terminal UI building blocks for terminal applications. Built on [Ink](https://github.com/vadimdemedes/ink) (React for CLIs).

## Components

- **`Message`** — Styled status messages (info, error, warning, success)
- **`Task`** — Single task with status indicator (pending, running, done, error)
- **`TaskList`** — Group of tasks with a title
- **`SelectList`** — Interactive selection list with pointer highlight

## Utilities

- **`createTaskRunner()`** — Programmatic task execution with status updates
- **`symbols`** — Unicode symbols (✓, ✗, ⚠, ℹ, ➜, ❯, ●, ─)
- **`colors`** — Semantic color mappings (success, error, warning, info, HTTP methods)

## Usage

```tsx
import { Message, Task, SelectList, symbols, colors } from '@vertz/tui';

// In an Ink app
<Message type="success">Build complete</Message>
<Task name="Compiling" status="running" detail="src/app.ts" />
<SelectList title="Pick a runtime" choices={choices} selectedIndex={0} />
```

## License

MIT
