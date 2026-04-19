import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { agent } from '../agent';
import type { LLMAdapter } from '../loop/react-loop';
import { run } from '../run';
import { memoryStore } from '../stores/memory-store';
import { sqliteStore } from '../stores/sqlite-store';
import { MemoryStoreNotDurableError } from '../stores/errors';
import { crashAfterToolResults } from '../testing/crash-harness';
import { tool } from '../tool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScriptedCall {
  readonly text?: string;
  readonly toolCalls?: Array<{
    readonly id?: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
}

function mockLLM(responses: ScriptedCall[]): LLMAdapter {
  let i = 0;
  return {
    async chat() {
      const r = responses[i++] ?? { text: 'No more scripted responses', toolCalls: [] };
      return {
        text: r.text ?? '',
        toolCalls: (r.toolCalls ?? []).map((tc) => ({
          id: tc.id ?? `call_${i}_${tc.name}`,
          name: tc.name,
          arguments: tc.arguments,
        })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Feature tests — the MVP contract for durable tool execution
// ---------------------------------------------------------------------------

describe('Feature: durable tool execution', () => {
  describe('Given a side-effecting tool + store + sessionId', () => {
    describe('When the process crashes after handler ran but before tool_result persisted', () => {
      // NOTE: this test is RED through Phase 1 (framework doesn't call
      // appendMessagesAtomic yet so the crash harness never triggers), still
      // RED after Phase 2 (atomic writes land but no resume logic), and
      // GREEN at the end of Phase 3 (resume detection surfaces a
      // ToolDurabilityError tool_result instead of re-invoking the handler).
      it('Then a subsequent run() does NOT re-invoke the handler', async () => {
        let postSlackCallCount = 0;

        const postSlack = tool({
          description: 'Post to Slack',
          input: s.object({ text: s.string() }),
          output: s.object({ ts: s.string() }),
          // no safeToRetry — default side-effecting semantics
        });

        const sentinelAgent = agent('sentinel', {
          state: s.object({}),
          initialState: {},
          tools: { postSlack },
          model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          loop: { maxIterations: 5 },
        });

        const store = sqliteStore({ path: ':memory:' });

        // Pre-seed the session row (matches the DO walkthrough pattern where a
        // caller passes a fixed sessionId on every invocation — the session
        // needs to exist in the store before the first run() with that id).
        await store.saveSession({
          id: 'sess_durable_test',
          agentName: 'sentinel',
          userId: null,
          tenantId: null,
          state: '{}',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const llm = mockLLM([
          {
            text: 'Posting to Slack.',
            toolCalls: [{ id: 'call_1', name: 'postSlack', arguments: { text: 'hello' } }],
          },
          { text: 'Done.' },
        ]);

        // Wrap the store so the SECOND appendMessagesAtomic call throws,
        // simulating a crash AFTER the handler dispatched its side effect.
        const crashingStore = crashAfterToolResults(store);
        const toolProvider = {
          async postSlack({ text: _text }: { text: string }) {
            postSlackCallCount++;
            return { ts: `ts_${postSlackCallCount}` };
          },
        };

        await expect(
          run(sentinelAgent, {
            message: 'An issue came in.',
            sessionId: 'sess_durable_test',
            store: crashingStore,
            llm,
            tools: toolProvider,
          }),
        ).rejects.toThrow(/simulated crash/);

        expect(postSlackCallCount).toBe(1); // handler ran exactly once pre-crash

        // Resume with a healthy store + fresh scripted LLM. The LLM should
        // see a ToolDurabilityError tool_result in history and respond "Done."
        const llm2 = mockLLM([{ text: 'Done.' }]);
        const result = await run(sentinelAgent, {
          message: 'An issue came in.',
          sessionId: 'sess_durable_test', // same sessionId
          store, // healthy now
          llm: llm2,
          tools: toolProvider,
        });

        expect(result.status).toBe('complete');
        expect(postSlackCallCount).toBe(1); // ← THE POINT: NOT 2

        // The resume path wrote a ToolDurabilityError tool_result for call_1.
        const messages = await store.loadMessages('sess_durable_test');
        const durabilityMsg = messages.find((m) => m.role === 'tool' && m.toolCallId === 'call_1');
        expect(durabilityMsg).toBeDefined();
        const parsed = JSON.parse(durabilityMsg!.content) as {
          kind: string;
          toolName: string;
          toolCallId: string;
        };
        expect(parsed.kind).toBe('tool-durability-error');
        expect(parsed.toolName).toBe('postSlack');
        expect(parsed.toolCallId).toBe('call_1');
      });
    });
  });

  describe('Given store + sessionId is the memory store', () => {
    describe('When run() is called', () => {
      it('Then entry throws MemoryStoreNotDurableError before any LLM call', async () => {
        let llmWasCalled = false;
        const llm: LLMAdapter = {
          async chat() {
            llmWasCalled = true;
            return { text: 'unreachable', toolCalls: [] };
          },
        };

        const bareAgent = agent('bare', {
          state: s.object({}),
          initialState: {},
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 1 },
        });

        await expect(
          run(bareAgent, {
            message: 'Hi',
            sessionId: 'sess_whatever',
            store: memoryStore(),
            llm,
          }),
        ).rejects.toThrow(MemoryStoreNotDurableError);

        expect(llmWasCalled).toBe(false);
      });
    });
  });

  describe('Type-level', () => {
    it('rejects tool config fields that do not exist yet', () => {
      tool({
        description: 'x',
        input: s.object({}),
        output: s.object({}),
        // @ts-expect-error — `safeToRetry` does not exist on ToolConfig yet (Phase 4 adds it)
        safeToRetry: true,
      });
    });
  });
});
