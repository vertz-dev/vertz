# Phase 2: Theme and Core UI Components

**Prerequisites:** [Phase 1 -- Package Skeleton and Config Loading](./phase-01-scaffold-and-config.md)

**Goal:** Build the Ink component library: theme constants, TaskRunner abstraction, and core UI components (Task, TaskList, Message, Banner, SelectList).

---

## What to Implement

1. **Theme constants** -- `src/ui/theme.ts` with symbols, colors, and spacing
2. **TaskRunner interface** -- `src/ui/task-runner.ts` defining the Task/TaskGroup/TaskRunner contracts
3. **InkTaskRunner** -- `src/ui/ink-adapter.tsx` implementing TaskRunner with Ink
4. **Task component** -- `src/ui/components/Task.tsx` with pulsing dot animation
5. **TaskList component** -- `src/ui/components/TaskList.tsx` for group/task hierarchy
6. **Message component** -- `src/ui/components/Message.tsx` for info/warn/error/success
7. **Banner component** -- `src/ui/components/Banner.tsx` for branding header
8. **SelectList component** -- `src/ui/components/SelectList.tsx` for interactive selection

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── ui/
│   ├── theme.ts
│   ├── task-runner.ts
│   ├── ink-adapter.tsx
│   └── components/
│       ├── Task.tsx
│       ├── TaskList.tsx
│       ├── Message.tsx
│       ├── Banner.tsx
│       └── SelectList.tsx
```

### Test Files

```
packages/cli/src/ui/
├── __tests__/
│   ├── theme.test.ts
│   ├── task-runner.test.tsx
│   └── components/
│       ├── task.test.tsx
│       ├── task-list.test.tsx
│       ├── message.test.tsx
│       ├── banner.test.tsx
│       └── select-list.test.tsx
```

---

## Expected Behaviors to Test

### Theme (`src/ui/__tests__/theme.test.ts`)

- [ ] `symbols.success` is `'✓'`
- [ ] `symbols.error` is `'✗'`
- [ ] `symbols.warning` is `'⚠'`
- [ ] `symbols.arrow` is `'➜'`
- [ ] `colors.success` is `'greenBright'`
- [ ] `colors.error` is `'redBright'`
- [ ] `colors.method.GET` is `'greenBright'`
- [ ] `colors.method.POST` is `'blueBright'`
- [ ] `colors.method.DELETE` is `'redBright'`
- [ ] Theme objects are frozen (immutable)

### TaskRunner Interface (`src/ui/__tests__/task-runner.test.tsx`)

Tests use `ink-testing-library` to render components and assert on output.

- [ ] `createTaskRunner()` returns a TaskRunner instance
- [ ] `runner.group(name)` creates a TaskGroup
- [ ] `group.task(name, fn)` executes the function and renders task status
- [ ] Task starts in 'running' state with pulsing dot
- [ ] `task.update(message)` changes the displayed message
- [ ] `task.succeed(message)` shows success symbol and message
- [ ] `task.fail(message)` shows error symbol and message
- [ ] `runner.info(message)` renders an info message
- [ ] `runner.warn(message)` renders a warning message
- [ ] `runner.error(message)` renders an error message
- [ ] `runner.success(message)` renders a success message
- [ ] `group.dismiss()` removes the group from display
- [ ] `runner.cleanup()` unmounts the Ink app
- [ ] `runner.promptSelect()` renders a select list and resolves with chosen value
- [ ] `runner.promptInput()` renders a text input and resolves with entered value
- [ ] `runner.promptConfirm()` renders a yes/no prompt and resolves with boolean

### Task Component (`src/ui/__tests__/components/task.test.tsx`)

- [ ] Renders task name
- [ ] Shows pending symbol when status is 'pending'
- [ ] Shows running indicator when status is 'running'
- [ ] Shows success symbol when status is 'done'
- [ ] Shows error symbol when status is 'error'
- [ ] Displays optional detail message

### Message Component (`src/ui/__tests__/components/message.test.tsx`)

- [ ] Renders info message with info symbol and blue color
- [ ] Renders warning message with warning symbol and yellow color
- [ ] Renders error message with error symbol and red color
- [ ] Renders success message with success symbol and green color

### Banner Component (`src/ui/__tests__/components/banner.test.tsx`)

- [ ] Renders 'vertz' text
- [ ] Renders version number
- [ ] Version text is dimmed

### SelectList Component (`src/ui/__tests__/components/select-list.test.tsx`)

- [ ] Renders title
- [ ] Renders all choices
- [ ] Highlights the currently selected choice
- [ ] Arrow keys change selection
- [ ] Enter key confirms selection
- [ ] Returns the value of the selected choice

---

## Dependencies to Add

```json
{
  "dependencies": {
    "ink": "^5.x",
    "ink-spinner": "^5.x",
    "react": "^18.x"
  },
  "devDependencies": {
    "@types/react": "^18.x",
    "ink-testing-library": "^4.x"
  }
}
```

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/ui/
bun run typecheck
```

---

## Notes

- Use `ink-testing-library` for all component tests. It provides `render()` that returns `lastFrame()` for snapshot-style assertions.
- The `TaskRunner` interface must include the `promptSelect`, `promptInput`, and `promptConfirm` methods from the interactive prompts design. These are needed by commands in later phases.
- The PulsingDot animation cycles `○` through dim/normal/bright states. In tests, use a static rendering or mock timers.
- Components should be pure -- they receive props and render. State management lives in the TaskRunner adapter.
