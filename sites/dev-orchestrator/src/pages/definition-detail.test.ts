import { describe, expect, it } from 'vitest';
import type { AgentDetail, DefinitionDetail } from '../api/services/definitions';
import { resolveSelectedAgent, toggleStep } from './definition-detail-utils';

const mockAgent: AgentDetail = {
  name: 'planner',
  description: 'Plans work',
  model: 'minimax/MiniMax-M2.7',
  systemPrompt: 'You are a planner.',
  tools: ['readFile', 'writeFile'],
  maxIterations: 10,
};

const mockDefinition: DefinitionDetail = {
  name: 'feature-workflow',
  steps: [
    { name: 'plan', agent: 'planner', isApproval: false, agentDetail: mockAgent },
    { name: 'review', agent: undefined, isApproval: true, agentDetail: null },
    { name: 'implement', agent: 'implementer', isApproval: false, agentDetail: { ...mockAgent, name: 'implementer' } },
  ],
};

describe('resolveSelectedAgent', () => {
  it('returns null when no step is selected', () => {
    expect(resolveSelectedAgent(mockDefinition, undefined)).toBe(null);
  });

  it('returns null when definition is null', () => {
    expect(resolveSelectedAgent(null, 'plan')).toBe(null);
  });

  it('returns null when definition is undefined', () => {
    expect(resolveSelectedAgent(undefined, 'plan')).toBe(null);
  });

  it('returns agent detail for a step with an agent', () => {
    const result = resolveSelectedAgent(mockDefinition, 'plan');
    expect(result).toEqual(mockAgent);
  });

  it('returns null for a step without an agent', () => {
    expect(resolveSelectedAgent(mockDefinition, 'review')).toBe(null);
  });

  it('returns null for an unknown step name', () => {
    expect(resolveSelectedAgent(mockDefinition, 'unknown')).toBe(null);
  });

  it('returns correct agent for a different step', () => {
    const result = resolveSelectedAgent(mockDefinition, 'implement');
    expect(result?.name).toBe('implementer');
  });
});

describe('toggleStep', () => {
  it('selects a step when nothing is selected', () => {
    expect(toggleStep(undefined, 'plan')).toBe('plan');
  });

  it('deselects when clicking the same step', () => {
    expect(toggleStep('plan', 'plan')).toBe(undefined);
  });

  it('switches to a different step', () => {
    expect(toggleStep('plan', 'implement')).toBe('implement');
  });
});
