import type { ProgressEmitter } from '../../lib/progress-emitter';
import type { WorkflowStore } from './workflows';

/**
 * Create an SSE stream handler for workflow progress events.
 *
 * Returns a Response with `text/event-stream` content type that:
 * 1. Sends a snapshot of all past events for the run on connect
 * 2. Streams new events as they occur
 * 3. Sends heartbeat comments every 30s
 * 4. Cleans up on client disconnect
 */
export function handleWorkflowStream(
  runId: string,
  store: WorkflowStore,
  emitter: ProgressEmitter,
): Response {
  const run = store.get(runId);
  if (!run) {
    return new Response('Not found', { status: 404 });
  }

  let unsub: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        controller.enqueue(encoder.encode(data));
      }

      // Send snapshot of past events
      const events = emitter.snapshot(runId);
      for (const event of events) {
        send(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Subscribe to new events
      unsub = emitter.subscribe(runId, (event) => {
        try {
          send(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Stream closed
        }
      });

      // Heartbeat every 30s
      heartbeat = setInterval(() => {
        try {
          send(': heartbeat\n\n');
        } catch {
          // Stream closed
        }
      }, 30_000);
    },

    cancel() {
      unsub?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
