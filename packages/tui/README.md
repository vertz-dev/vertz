# @vertz/tui

Terminal UI toolkit for building interactive CLI applications. Powers `@vertz/cli` and generated CLIs.

## Installation

```bash
npm install @vertz/tui
```

## Quick Start

```tsx
import { tui, Text, Box, Spinner } from '@vertz/tui';

function App() {
  return (
    <Box direction="column" gap={1}>
      <Text bold>My CLI App</Text>
      <Spinner label="Loading..." />
    </Box>
  );
}

const app = tui(<App />, { mode: 'inline' });
await app.waitUntilExit();
```

## Prompts

Interactive prompts for collecting user input — text, select, multi-select, confirm, and password:

```typescript
import { prompt } from '@vertz/tui';

const name = await prompt.text({ message: 'Project name' });

const runtime = await prompt.select({
  message: 'Pick a runtime',
  options: [
    { label: 'Bun', value: 'bun' },
    { label: 'Node.js', value: 'node' },
    { label: 'Deno', value: 'deno' },
  ],
});

const features = await prompt.multiSelect({
  message: 'Enable features',
  options: [
    { label: 'TypeScript', value: 'ts' },
    { label: 'Linting', value: 'lint' },
  ],
});

const confirmed = await prompt.confirm({ message: 'Continue?' });
```

## Wizard

Multi-step flows with typed results:

```typescript
import { wizard } from '@vertz/tui';

const result = await wizard({
  steps: [
    { id: 'name', prompt: () => prompt.text({ message: 'Project name' }) },
    { id: 'runtime', prompt: () => prompt.select({ message: 'Runtime', options: runtimes }) },
  ] as const,
});

console.log(result.name); // string
console.log(result.runtime); // typed from options
```

## Components

### Layout

- **`Box`** — Flexbox-style container with `direction`, `gap`, `padding`, `border`
- **`Text`** — Styled text with `bold`, `italic`, `underline`, `color`, `dimmed`
- **`Spacer`** — Flexible space between elements
- **`Divider`** — Horizontal line separator

### Data Display

- **`Table`** — Tabular data with typed columns
- **`KeyValue`** — Key-value pairs
- **`Log`** / **`LogStream`** — Log output with timestamps
- **`Banner`** — Highlighted banner messages
- **`DiagnosticView`** — Compiler diagnostic display with source context

### Interactive

- **`TextInput`** — Text input field
- **`Select`** — Single-choice selection
- **`MultiSelect`** — Multi-choice selection
- **`Confirm`** — Yes/no confirmation
- **`PasswordInput`** — Masked password input

### Feedback

- **`Spinner`** — Loading indicator
- **`ProgressBar`** — Progress bar with percentage
- **`TaskRunner`** — Task list with status indicators (pending, running, done, error)
- **`Dashboard`** — Multi-panel dashboard layout

## Utilities

- **`symbols`** — Unicode symbols (`✓`, `✗`, `⚠`, `ℹ`, `➜`, `❯`, `●`, `─`)
- **`colors`** — Semantic color mappings (success, error, warning, info)
- **`useKeyboard`** — Keyboard input hook
- **`useFocus`** — Focus management for interactive components
- **`isInteractive`** — Detect if running in an interactive terminal
- **`renderToString`** — Render components to string (for testing or non-interactive output)

## Related Packages

- [`@vertz/cli`](../cli) — The Vertz CLI (built with this package)
- [`@vertz/cli-runtime`](../cli-runtime) — Runtime for generated CLIs

## License

MIT
