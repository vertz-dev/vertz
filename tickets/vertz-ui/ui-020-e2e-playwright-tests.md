# ui-020: E2E testing infrastructure with Playwright

- **Status:** 🟡 In Progress
- **Assigned:** ava (testing) + edson (infra)
- **Phase:** v0.1.x quality
- **Estimate:** 6h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —

## Description

Set up Playwright-based E2E testing for vertz UI features. This enables testing real browser behavior — page transitions, CSS rendering, routing, theme switching — that unit tests with happy-dom cannot cover.

### What's already done

- Playwright MCP plugin enabled in `/app/.claude/settings.json` (Claude Code can drive a browser interactively)
- Chromium headless installed and verified working inside Docker
- Dockerfile updated (`/app/backstage/Dockerfile`) to bake in:
  - Playwright system dependencies (as root, line 43-45)
  - Chromium browser binary (as dev user, line 64-65)
- Container rebuild will preserve the installation automatically

### What needs to be built

#### 1. Playwright config and test structure

Add Playwright as a dev dependency to the task-manager example app (or a new top-level `e2e/` workspace package). Create the Playwright config targeting the task-manager dev server.

```
examples/task-manager/
├── playwright.config.ts
├── e2e/
│   ├── task-list.spec.ts
│   ├── task-create.spec.ts
│   ├── settings.spec.ts
│   ├── page-transitions.spec.ts
│   └── routing.spec.ts
```

#### 2. Dev server integration

Playwright needs a running dev server to test against. The config should use Playwright's `webServer` option to automatically start the task-manager dev server before tests and shut it down after.

```ts
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: 'bun run dev',
    port: 5173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

#### 3. Core E2E test specs

**task-list.spec.ts** — Tests that the task list loads, displays tasks, and filters work:
- Navigate to `/`, verify task cards appear
- Click filter buttons, verify correct filtering
- Click "Create task" button, verify navigation

**page-transitions.spec.ts** — Tests that page transitions animate correctly:
- Navigate between pages, verify transition CSS classes applied
- Verify content changes after transition completes
- This is the spec that would have caught the page transition bugs from Josh's demo

**settings.spec.ts** — Tests theme switching:
- Navigate to settings page
- Click dark theme card, verify theme class changes on root element
- Click light theme card, verify it switches back

**routing.spec.ts** — Tests the router:
- Navigate via links, verify URL changes and correct page renders
- Use browser back/forward, verify correct behavior
- Direct URL navigation (deep linking)

#### 4. CI integration

Add a Playwright step to the GitHub Actions workflow:
- Runs after lint/typecheck/unit tests pass
- Uses the existing Docker image (Chromium already baked in)
- Uploads test results and traces as artifacts on failure
- Only runs when `packages/ui/` or `examples/task-manager/` files change

## Acceptance Criteria

- [ ] `playwright` added as dev dependency (task-manager or dedicated e2e package)
- [ ] `playwright.config.ts` with webServer pointing to task-manager dev server
- [ ] At least 4 E2E test specs covering: task list, page transitions, settings/theme, routing
- [ ] `bun run e2e` (or similar) runs all Playwright tests
- [ ] Tests pass in headless Chromium inside Docker
- [ ] Dockerfile bakes in Playwright + Chromium (already done — verify on rebuild)
- [ ] CI workflow step for E2E tests (runs on relevant file changes only)
- [ ] Test traces saved as CI artifacts on failure

## Progress

- 2026-02-12: Playwright MCP plugin enabled, Chromium installed in Docker, Dockerfile updated with Playwright deps. Browser verified working inside container.
