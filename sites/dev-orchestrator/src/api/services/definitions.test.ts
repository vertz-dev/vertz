import { describe, expect, it } from 'bun:test';
import { extractStepSummaries, extractDefinitionDetail } from './definitions';
import type { WorkflowDefinition } from '@vertz/agents';

// Minimal mock workflow definition matching the real structure
function mockWorkflow(steps: Array<{ name: string; agent?: { name: string; description?: string; model: { provider: string; model: string }; prompt: { system: string }; loop: { maxIterations: number }; tools: Record<string, unknown> }; approval?: unknown }>): WorkflowDefinition {
  return {
    kind: 'workflow',
    name: 'test-flow',
    input: {} as WorkflowDefinition['input'],
    steps: steps.map((s) => ({
      kind: 'step' as const,
      name: s.name,
      agent: s.agent as WorkflowDefinition['steps'][number]['agent'],
      approval: s.approval as WorkflowDefinition['steps'][number]['approval'],
    })),
    access: {},
  };
}

describe('extractStepSummaries()', () => {
  it('returns step summaries for agent steps', () => {
    const wf = mockWorkflow([
      { name: 'plan', agent: { name: 'planner', description: 'Plans', model: { provider: 'test', model: 'test-m' }, prompt: { system: 'You plan' }, loop: { maxIterations: 10 }, tools: {} } },
      { name: 'implement', agent: { name: 'implementer', description: 'Implements', model: { provider: 'test', model: 'test-m' }, prompt: { system: 'You implement' }, loop: { maxIterations: 20 }, tools: {} } },
    ]);
    const summaries = extractStepSummaries(wf);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toEqual({ name: 'plan', agent: 'planner', isApproval: false });
    expect(summaries[1]).toEqual({ name: 'implement', agent: 'implementer', isApproval: false });
  });

  it('marks approval steps correctly', () => {
    const wf = mockWorkflow([
      { name: 'plan', agent: { name: 'planner', description: 'Plans', model: { provider: 'test', model: 'test-m' }, prompt: { system: 'You plan' }, loop: { maxIterations: 10 }, tools: {} } },
      { name: 'human-approval', approval: { message: () => 'Approve?', timeout: '7d' } },
    ]);
    const summaries = extractStepSummaries(wf);
    expect(summaries[1]).toEqual({ name: 'human-approval', agent: undefined, isApproval: true });
  });

  it('returns empty array for empty workflow', () => {
    const wf = mockWorkflow([]);
    expect(extractStepSummaries(wf)).toHaveLength(0);
  });
});

describe('extractDefinitionDetail()', () => {
  it('returns null for null definition', () => {
    expect(extractDefinitionDetail(null)).toBeNull();
  });

  it('returns full detail with agent info', () => {
    const wf = mockWorkflow([
      {
        name: 'plan',
        agent: {
          name: 'planner',
          description: 'Plans things',
          model: { provider: 'minimax', model: 'M2.7' },
          prompt: { system: 'You are a planner' },
          loop: { maxIterations: 15 },
          tools: { readFile: {}, writeFile: {} },
        },
      },
    ]);
    const detail = extractDefinitionDetail(wf);
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('test-flow');
    expect(detail!.steps).toHaveLength(1);
    expect(detail!.steps[0].name).toBe('plan');
    expect(detail!.steps[0].agent).toBe('planner');
    expect(detail!.steps[0].agentDetail).toEqual({
      name: 'planner',
      description: 'Plans things',
      model: 'minimax/M2.7',
      systemPrompt: 'You are a planner',
      tools: ['readFile', 'writeFile'],
      maxIterations: 15,
    });
  });

  it('returns null agentDetail for approval steps', () => {
    const wf = mockWorkflow([
      { name: 'human-approval', approval: { message: () => 'Approve?', timeout: '7d' } },
    ]);
    const detail = extractDefinitionDetail(wf);
    expect(detail!.steps[0].agentDetail).toBeNull();
  });
});
