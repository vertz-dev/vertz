import { describe, expect, it } from '@vertz/test';
import type { AgentDefinition } from '@vertz/agents';
import { createAgentRegistry } from './agents';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockAgent(opts: { name: string; description?: string; tools?: AgentDefinition['tools']; model?: AgentDefinition['model']; prompt?: AgentDefinition['prompt']; loop?: AgentDefinition['loop'] }): AgentDefinition<any, any, any> {
  return {
    kind: 'agent',
    name: opts.name,
    description: opts.description ?? 'Test agent',
    state: {} as AgentDefinition['state'],
    initialState: {},
    tools: opts.tools ?? {},
    model: opts.model ?? { provider: 'minimax' as const, model: 'M2.7' },
    prompt: opts.prompt ?? { system: 'Default prompt' },
    loop: opts.loop ?? { maxIterations: 10 },
    access: {},
    inject: {},
  };
}

describe('createAgentRegistry', () => {
  describe('list()', () => {
    it('returns summaries for all registered agents', () => {
      const registry = createAgentRegistry([
        mockAgent({ name: 'planner', description: 'Plans work' }),
        mockAgent({ name: 'reviewer', description: 'Reviews code' }),
      ]);
      const result = registry.list();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'planner',
        description: 'Plans work',
        model: 'minimax/M2.7',
        toolCount: 0,
      });
    });

    it('counts tools correctly', () => {
      const registry = createAgentRegistry([
        mockAgent({
          name: 'planner',
          tools: {
            readFile: { kind: 'tool', description: 'Read file' },
            writeFile: { kind: 'tool', description: 'Write file' },
          } as unknown as AgentDefinition['tools'],
        }),
      ]);
      expect(registry.list()[0].toolCount).toBe(2);
    });

    it('returns empty array for no agents', () => {
      const registry = createAgentRegistry([]);
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe('get()', () => {
    it('returns null for unknown agent', () => {
      const registry = createAgentRegistry([]);
      expect(registry.get('unknown')).toBeNull();
    });

    it('returns full detail with system prompt', () => {
      const registry = createAgentRegistry([
        mockAgent({
          name: 'planner',
          description: 'Plans work',
          prompt: { system: 'You are a planner.' },
          loop: {
            maxIterations: 30,
            tokenBudget: { max: 50000, warningThreshold: 0.8, stopThreshold: 0.95 },
          },
        }),
      ]);
      const detail = registry.get('planner');
      expect(detail).not.toBeNull();
      expect(detail!.name).toBe('planner');
      expect(detail!.systemPrompt).toBe('You are a planner.');
      expect(detail!.maxIterations).toBe(30);
      expect(detail!.tokenBudget).toEqual({ max: 50000, warningThreshold: 0.8, stopThreshold: 0.95 });
    });

    it('returns tools with names and descriptions', () => {
      const registry = createAgentRegistry([
        mockAgent({
          name: 'planner',
          tools: {
            readFile: { kind: 'tool', description: 'Read a file from sandbox' },
          } as unknown as AgentDefinition['tools'],
        }),
      ]);
      const detail = registry.get('planner');
      expect(detail!.tools).toHaveLength(1);
      expect(detail!.tools[0]).toEqual({ name: 'readFile', description: 'Read a file from sandbox' });
    });

    it('returns undefined tokenBudget when not configured', () => {
      const registry = createAgentRegistry([
        mockAgent({ name: 'planner', loop: { maxIterations: 10 } }),
      ]);
      expect(registry.get('planner')!.tokenBudget).toBeUndefined();
    });
  });

  describe('updatePrompt()', () => {
    it('returns false for unknown agent', () => {
      const registry = createAgentRegistry([]);
      expect(registry.updatePrompt('unknown', 'new prompt')).toBe(false);
    });

    it('updates the in-memory prompt for a known agent', () => {
      const registry = createAgentRegistry([
        mockAgent({ name: 'planner', prompt: { system: 'Original' } }),
      ]);
      expect(registry.updatePrompt('planner', 'Updated prompt')).toBe(true);
      expect(registry.get('planner')!.systemPrompt).toBe('Updated prompt');
    });

    it('does not mutate original agent definition', () => {
      const agent = mockAgent({ name: 'planner', prompt: { system: 'Original' } });
      const registry = createAgentRegistry([agent]);
      registry.updatePrompt('planner', 'Updated');
      expect(agent.prompt.system).toBe('Original');
    });
  });

  describe('getEffectivePrompt()', () => {
    it('returns original prompt when no override exists', () => {
      const registry = createAgentRegistry([
        mockAgent({ name: 'planner', prompt: { system: 'Original' } }),
      ]);
      expect(registry.getEffectivePrompt('planner')).toBe('Original');
    });

    it('returns overridden prompt after updatePrompt', () => {
      const registry = createAgentRegistry([
        mockAgent({ name: 'planner', prompt: { system: 'Original' } }),
      ]);
      registry.updatePrompt('planner', 'New');
      expect(registry.getEffectivePrompt('planner')).toBe('New');
    });

    it('returns undefined for unknown agent', () => {
      const registry = createAgentRegistry([]);
      expect(registry.getEffectivePrompt('unknown')).toBeUndefined();
    });
  });
});
