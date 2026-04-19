// Perf regression gate for the durable-resume write pattern (#2835).
//
// Measures wall time for a 10-step scripted loop against
// `sqliteStore({ path: ':memory:' })`. In-memory SQLite is not D1, but it's
// the closest same-process transactional store and gives a useful lower bound
// for the overhead added by per-step atomic writes. Real D1 same-region
// measurement lives in Phase 5's manual checklist.
//
// Gate: < 200ms for 10 steps on in-memory SQLite. If CI makes this flaky,
// rename back to `.local.ts` and drop from default test collection.

import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { agent } from '../agent';
import type { LLMAdapter } from '../loop/react-loop';
import { run } from '../run';
import { sqliteStore } from '../stores/sqlite-store';
import { tool } from '../tool';

function scriptedLLM(steps: number): LLMAdapter {
  let i = 0;
  return {
    async chat() {
      i++;
      if (i >= steps) {
        return { text: 'done', toolCalls: [] };
      }
      return {
        text: `step ${i}`,
        toolCalls: [{ id: `call_${i}`, name: 'ping', arguments: { n: i } }],
      };
    },
  };
}

describe('perf: durable-resume write pattern', () => {
  it('10-step loop against sqliteStore(:memory:) completes under 200ms', async () => {
    const ping = tool({
      description: 'no-op',
      input: s.object({ n: s.number() }),
      output: s.object({ ok: s.boolean() }),
      handler: () => ({ ok: true }),
    });
    const perfAgent = agent('perf', {
      state: s.object({}),
      initialState: {},
      tools: { ping },
      model: { provider: 'cloudflare', model: 'test' },
      loop: { maxIterations: 12 },
    });

    const store = sqliteStore({ path: ':memory:' });
    await store.saveSession({
      id: 'sess_perf',
      agentName: 'perf',
      userId: null,
      tenantId: null,
      state: '{}',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const t0 = performance.now();
    const result = await run(perfAgent, {
      message: 'go',
      sessionId: 'sess_perf',
      store,
      llm: scriptedLLM(10),
    });
    const elapsed = performance.now() - t0;

    // eslint-disable-next-line no-console -- perf one-shot is meant to be observed
    console.log(`[perf] 10-step durable loop: ${elapsed.toFixed(1)}ms`);

    expect(result.status).toBe('complete');
    expect(elapsed).toBeLessThan(200);
  });
});
