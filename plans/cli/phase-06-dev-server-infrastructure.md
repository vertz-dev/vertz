# Phase 6: Dev Server Infrastructure

**Prerequisites:** [Phase 5 -- `vertz build` Command](./phase-05-build-command.md)

**Goal:** Build the infrastructure components that the dev server needs: file watcher, process manager, and path/format utilities. These are standalone modules that the `vertz dev` command will orchestrate in Phase 7.

---

## What to Implement

1. **File watcher** -- `src/dev-server/watcher.ts` with cross-runtime file watching and change batching
2. **Process manager** -- `src/dev-server/process-manager.ts` for child process lifecycle management
3. **Path utilities** -- `src/utils/paths.ts` for project root discovery and path formatting
4. **Format utilities** -- `src/utils/format.ts` for duration, file size, and path formatting

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── dev-server/
│   ├── watcher.ts
│   └── process-manager.ts
└── utils/
    ├── paths.ts
    └── format.ts
```

### Test Files

```
packages/cli/src/
├── dev-server/
│   └── __tests__/
│       ├── watcher.test.ts
│       └── process-manager.test.ts
└── utils/
    └── __tests__/
        ├── paths.test.ts
        └── format.test.ts
```

---

## Expected Behaviors to Test

### File Watcher (`src/dev-server/__tests__/watcher.test.ts`)

- [ ] `createWatcher(dir)` creates a watcher for the given directory
- [ ] Watcher emits 'change' events when files are modified
- [ ] Watcher emits 'change' events when files are added
- [ ] Watcher emits 'change' events when files are removed
- [ ] Events include the file path and event type
- [ ] Rapid changes within 100ms are batched into a single event
- [ ] `watcher.close()` stops watching and cleans up resources
- [ ] Watcher ignores `node_modules` directory
- [ ] Watcher ignores `.git` directory
- [ ] Watcher ignores the output directory (`.vertz/generated`)

### Process Manager (`src/dev-server/__tests__/process-manager.test.ts`)

- [ ] `createProcessManager()` returns a ProcessManager instance
- [ ] `pm.start(entryPoint)` spawns a child process
- [ ] `pm.isRunning()` returns `true` after start
- [ ] `pm.isRunning()` returns `false` before start
- [ ] `pm.stop()` terminates the child process
- [ ] `pm.isRunning()` returns `false` after stop
- [ ] `pm.restart()` stops and starts the process
- [ ] `pm.onOutput(handler)` receives stdout from child process
- [ ] `pm.onError(handler)` receives stderr from child process
- [ ] `pm.stop()` sends SIGTERM first
- [ ] `pm.stop()` sends SIGKILL after 2s timeout if process is still alive
- [ ] `pm.start()` accepts optional environment variables
- [ ] Starting when already running stops the existing process first

### Path Utilities (`src/utils/__tests__/paths.test.ts`)

- [ ] `findProjectRoot()` returns the directory containing `package.json`
- [ ] `findProjectRoot()` walks up from the given starting directory
- [ ] `findProjectRoot()` returns `null` when no `package.json` is found
- [ ] `relativePath(from, to)` returns a relative path between two absolute paths

### Format Utilities (`src/utils/__tests__/format.test.ts`)

- [ ] `formatDuration(ms)` returns `'42ms'` for milliseconds under 1000
- [ ] `formatDuration(ms)` returns `'1.2s'` for seconds
- [ ] `formatDuration(ms)` returns `'2m 30s'` for minutes
- [ ] `formatFileSize(bytes)` returns `'1.2 KB'` for kilobytes
- [ ] `formatFileSize(bytes)` returns `'42 B'` for bytes
- [ ] `formatFileSize(bytes)` returns `'3.4 MB'` for megabytes
- [ ] `formatPath(absolutePath, projectRoot)` returns a short relative path

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/dev-server/ packages/cli/src/utils/
bun run typecheck
```

---

## Notes

- **File watcher**: Use Bun's native `Bun.file` watcher when running on Bun, fall back to `chokidar` on Node. The `createWatcher` function should detect the runtime and choose accordingly. Tests should use a temp directory with real file operations for integration-style tests, or mock the underlying watcher for unit tests.
- **Process manager**: Tests for process spawning can use a simple script (`node -e "process.stdin.resume()"`) as the child process. The SIGTERM/SIGKILL timeout behavior can be tested with mock timers.
- **Debouncing**: The 100ms debounce in the watcher is important for performance. Use `vi.useFakeTimers()` in tests to control timing precisely.
- These modules are designed to be independent and testable in isolation. They have no dependency on Ink, Commander, or the compiler.
