import { describe, expect, it } from 'bun:test';
import type { StepSummary } from '../../api/services/definitions';
import { computeLayout } from './workflow-layout';

function step(name: string, agent?: string, isApproval = false): StepSummary {
  return { name, agent, isApproval };
}

describe('computeLayout()', () => {
  it('returns empty layout for empty steps', () => {
    const layout = computeLayout([]);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.rows).toBe(0);
    expect(layout.cols).toBe(0);
  });

  it('assigns sequential rows for linear workflow', () => {
    const steps = [
      step('plan', 'planner'),
      step('review', 'reviewer'),
      step('implement', 'implementer'),
    ];
    const layout = computeLayout(steps);
    expect(layout.nodes).toHaveLength(3);
    expect(layout.nodes[0]).toEqual({ name: 'plan', type: 'agent', agent: 'planner', row: 0, col: 0 });
    expect(layout.nodes[1]).toEqual({ name: 'review', type: 'agent', agent: 'reviewer', row: 1, col: 0 });
    expect(layout.nodes[2]).toEqual({ name: 'implement', type: 'agent', agent: 'implementer', row: 2, col: 0 });
  });

  it('creates edges between consecutive steps', () => {
    const steps = [step('a', 'x'), step('b', 'y'), step('c', 'z')];
    const layout = computeLayout(steps);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges[0]).toEqual({ from: 'a', to: 'b' });
    expect(layout.edges[1]).toEqual({ from: 'b', to: 'c' });
  });

  it('marks approval steps as type "approval"', () => {
    const steps = [step('plan', 'planner'), step('approve', undefined, true)];
    const layout = computeLayout(steps);
    expect(layout.nodes[0].type).toBe('agent');
    expect(layout.nodes[1].type).toBe('approval');
  });

  it('computes correct rows and cols', () => {
    const steps = Array.from({ length: 9 }, (_, i) => step(`step-${i}`, `agent-${i}`));
    const layout = computeLayout(steps);
    expect(layout.rows).toBe(9);
    expect(layout.cols).toBe(1);
    expect(layout.nodes).toHaveLength(9);
    expect(layout.edges).toHaveLength(8);
  });

  it('is deterministic (same input = same output)', () => {
    const steps = [step('a', 'x'), step('b', 'y')];
    const layout1 = computeLayout(steps);
    const layout2 = computeLayout(steps);
    expect(layout1).toEqual(layout2);
  });
});
