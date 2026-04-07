# Phase 0: Progress Events + SSE Runtime Verification

## Context

The orchestrator dashboard needs two foundational capabilities before any UI work:

1. **Step progress events** — The workflow executor (`runWorkflow()` in `@vertz/agents`) currently runs to completion with no progress callbacks. The dashboard needs to know when each step starts/completes.

2. **VTZ runtime migration** — The dev-orchestrator currently uses `Bun.serve()`. The design targets VTZ runtime. VTZ has SSE support for MCP endpoints (axum `Sse<impl Stream>`), but the persistent V8 isolate bridges responses as fully-buffered `Vec<u8>`. User API routes may not support streaming.

Design doc: `plans/orchestrator-dashboard.md`

---

## Task 1: Add `onStepProgress` callback to `runWorkflow()`

**Files:** (3)
- `packages/agents/src/workflow.ts` (modified)
- `packages/agents/src/workflow.test.ts` (modified)

**What to implement:**

Add an optional `onStepProgress` callback to `RunWorkflowOptions`:

```typescript
export interface StepProgressEvent {
  readonly step: string;
  readonly type: 'step-started' | 'step-completed' | 'step-failed';
  readonly timestamp: number;
  readonly iterations?: number;
  readonly response?: string;
}

export interface RunWorkflowOptions<TInput = unknown> {
  // ... existing fields ...
  readonly onStepProgress?: (event: StepProgressEvent) => void;
}
```

In `runWorkflow()`, emit events:
- `step-started` before running each agent step (after skip/resume logic)
- `step-completed` after a step succeeds (with iterations and response)
- `step-failed` after a step fails (with iterations and response)

The callback is fire-and-forget (synchronous call, no await). Existing behavior is unchanged when callback is not provided.

**Acceptance criteria:**
- [ ] `onStepProgress` callback receives `step-started` before each agent step executes
- [ ] `onStepProgress` callback receives `step-completed` after each successful step
- [ ] `onStepProgress` callback receives `step-failed` when a step fails
- [ ] Events include step name, type, and timestamp
- [ ] `step-completed` events include iteration count and response
- [ ] Callback is optional — omitting it does not change behavior
- [ ] Approval steps emit no events (they suspend, not execute)
- [ ] Resumed workflows (via `resumeAfter`) only emit events for steps that actually run

---

## Task 2: Wire progress events into the workflow executor

**Files:** (4)
- `sites/dev-orchestrator/src/lib/workflow-executor.ts` (modified)
- `sites/dev-orchestrator/src/lib/workflow-executor.test.ts` (modified)
- `sites/dev-orchestrator/src/lib/progress-emitter.ts` (new)
- `sites/dev-orchestrator/src/lib/progress-emitter.test.ts` (new)

**What to implement:**

Create a `ProgressEmitter` that collects step progress events and allows SSE subscribers:

```typescript
export interface ProgressEmitter {
  /** Register a listener for a specific run. Returns unsubscribe function. */
  subscribe(runId: string, listener: (event: StepProgressEvent) => void): () => void;
  /** Emit a progress event to all subscribers of a run. */
  emit(runId: string, event: StepProgressEvent): void;
  /** Get all events for a run (for snapshot-on-connect). */
  snapshot(runId: string): readonly StepProgressEvent[];
  /** Clean up events for a completed/failed run after retention period. */
  cleanup(runId: string): void;
}

export function createProgressEmitter(): ProgressEmitter;
```

Update `createWorkflowExecutor()` to:
1. Accept a `ProgressEmitter` in options
2. Pass `onStepProgress` to `runWorkflow()` that calls `emitter.emit(runId, event)`

**Acceptance criteria:**
- [ ] `ProgressEmitter` stores events per run and notifies subscribers
- [ ] `subscribe()` returns an unsubscribe function
- [ ] `snapshot()` returns all events for a run (for SSE reconnection)
- [ ] `cleanup()` removes events for a specific run
- [ ] Workflow executor passes progress events from `runWorkflow()` to the emitter
- [ ] Multiple subscribers can listen to the same run

---

## Task 3: Add SSE streaming endpoint

**Files:** (4)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.test.ts` (modified — if exists, or new)
- `sites/dev-orchestrator/src/api/server.ts` (modified)

**What to implement:**

Add a streaming endpoint that sends step progress events via SSE. Since `@vertz/server` service actions return single responses, implement SSE as a raw route handler alongside the service:

```typescript
// In server.ts — add raw SSE route before the service
app.get('/api/workflows/:id/stream', (req) => {
  const runId = req.params.id;
  const run = store.get(runId);
  if (!run) return new Response('Not found', { status: 404 });

  const stream = new ReadableStream({
    start(controller) {
      // Send snapshot
      const events = emitter.snapshot(runId);
      for (const event of events) {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Subscribe to new events
      const unsub = emitter.subscribe(runId, (event) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(': heartbeat\n\n');
      }, 30_000);

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        unsub();
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
```

**Note on VTZ runtime:** This task initially implements against Bun's streaming Response API. Task 4 verifies it works on VTZ. If VTZ doesn't support `ReadableStream` responses, Task 4 addresses the gap.

**Acceptance criteria:**
- [ ] `GET /api/workflows/:id/stream` returns `text/event-stream` content type
- [ ] On connect, sends snapshot of all past events for the run
- [ ] New events stream as they occur
- [ ] Heartbeat comment sent every 30s
- [ ] Returns 404 for unknown run IDs
- [ ] Connection cleans up on client disconnect

---

## Task 4: Verify/migrate to VTZ runtime

**Files:** (3-5, depends on gap)
- `sites/dev-orchestrator/package.json` (modified — add vtz dev script if needed)
- `native/vtz/src/runtime/persistent_isolate.rs` (potentially modified — if streaming gap exists)
- `native/vtz/src/server/http.rs` (potentially modified — if streaming gap exists)

**What to implement:**

1. Run the dev-orchestrator under VTZ (`vtz dev` in `sites/dev-orchestrator/`)
2. Verify all existing API endpoints work (start, get, list, approve)
3. Verify the SSE endpoint streams events correctly

**If VTZ runtime lacks streaming response support:**

The persistent isolate currently converts JS `Response` objects to `IsolateResponse { body: Vec<u8> }` by reading the full body. To support SSE, we need to detect when the response body is a `ReadableStream` and stream chunks through a channel to axum, which can then use `axum::body::Body::from_stream()`.

The MCP SSE code in `native/vtz/src/server/mcp.rs` (lines ~993) demonstrates axum SSE is fully supported. The gap is the JS → Rust bridge for user API responses.

**Acceptance criteria:**
- [ ] Dev-orchestrator starts and serves under VTZ runtime (`vtz dev`)
- [ ] All existing API endpoints return correct responses
- [ ] SSE endpoint streams events (not buffered into single response)
- [ ] If streaming required runtime changes, those changes are minimal and tested
- [ ] Heartbeat arrives within 30s of connection
