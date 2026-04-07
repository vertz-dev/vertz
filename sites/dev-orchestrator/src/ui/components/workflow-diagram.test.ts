import { describe, expect, it } from 'vitest';
import type { StepSummary } from '../../api/services/definitions';
import { computeLayout } from '../lib/workflow-layout';
import { edgeCoordinates, NODE_GAP, NODE_HEIGHT } from './edge-line-utils';
import { stepNodeBorderColor, stepNodeBackground } from './step-node-utils';

/**
 * Integration tests for the workflow diagram rendering pipeline.
 * Tests the full computation chain: steps → layout → node styles + edge coordinates.
 * Component rendering itself requires the Vertz compiler (tested via E2E).
 */

const nineStepWorkflow: readonly StepSummary[] = [
  { name: 'plan', agent: 'planner', isApproval: false },
  { name: 'plan-review', agent: undefined, isApproval: true },
  { name: 'design', agent: 'designer', isApproval: false },
  { name: 'design-review', agent: undefined, isApproval: true },
  { name: 'implement', agent: 'implementer', isApproval: false },
  { name: 'test', agent: 'tester', isApproval: false },
  { name: 'code-review', agent: 'reviewer', isApproval: false },
  { name: 'ci', agent: 'ci-monitor', isApproval: false },
  { name: 'deploy', agent: undefined, isApproval: true },
];

describe('WorkflowDiagram integration: layout + node/edge computation', () => {
  it('computes layout for 9-step workflow with correct dimensions', () => {
    const layout = computeLayout(nineStepWorkflow);
    expect(layout.rows).toBe(9);
    expect(layout.cols).toBe(1);
    expect(layout.nodes).toHaveLength(9);
    expect(layout.edges).toHaveLength(8);
  });

  it('assigns sequential rows to all nodes', () => {
    const layout = computeLayout(nineStepWorkflow);
    layout.nodes.forEach((node, i) => {
      expect(node.row).toBe(i);
    });
  });

  it('correctly identifies approval vs agent node types', () => {
    const layout = computeLayout(nineStepWorkflow);
    expect(layout.nodes[0].type).toBe('agent');
    expect(layout.nodes[1].type).toBe('approval');
    expect(layout.nodes[3].type).toBe('approval');
    expect(layout.nodes[8].type).toBe('approval');
    expect(layout.nodes[4].type).toBe('agent');
  });

  it('computes edge coordinates that connect consecutive rows', () => {
    const layout = computeLayout(nineStepWorkflow);
    for (const edge of layout.edges) {
      const fromNode = layout.nodes.find((n) => n.name === edge.from)!;
      const toNode = layout.nodes.find((n) => n.name === edge.to)!;
      const coords = edgeCoordinates(fromNode.row, toNode.row);
      expect(coords.y1).toBe(fromNode.row * (NODE_HEIGHT + NODE_GAP) + NODE_HEIGHT);
      expect(coords.y2).toBe(toNode.row * (NODE_HEIGHT + NODE_GAP));
      expect(coords.y2).toBeGreaterThan(coords.y1);
    }
  });

  it('selected step gets primary border and accent background', () => {
    expect(stepNodeBorderColor(undefined, true)).toBe('var(--color-primary)');
    expect(stepNodeBackground(undefined, true)).toBe('var(--color-accent)');
  });

  it('active run status maps correctly to node styles', () => {
    const statuses = {
      plan: 'completed' as const,
      'plan-review': 'completed' as const,
      design: 'active' as const,
      implement: 'pending' as const,
    };

    expect(stepNodeBorderColor(statuses.plan)).toBe('hsl(142, 76%, 36%)');
    expect(stepNodeBorderColor(statuses.design)).toBe('hsl(217, 91%, 60%)');
    expect(stepNodeBorderColor(statuses.implement)).toBe('var(--color-border)');
    expect(stepNodeBackground(statuses.design)).toBe('hsl(217, 91%, 60%, 0.08)');
    expect(stepNodeBackground(statuses.implement)).toBe('var(--color-card)');
  });

  it('total diagram height matches row count * (NODE_HEIGHT + NODE_GAP)', () => {
    const layout = computeLayout(nineStepWorkflow);
    const expectedHeight = layout.rows * (NODE_HEIGHT + NODE_GAP);
    expect(expectedHeight).toBe(9 * 60);
  });
});
