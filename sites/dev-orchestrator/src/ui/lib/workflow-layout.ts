import type { StepSummary } from '../../api/services/definitions';

export interface LayoutNode {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly row: number;
  readonly col: number;
}

export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

export interface DiagramLayout {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  readonly rows: number;
  readonly cols: number;
}

/**
 * Compute a visual layout for a sequential workflow.
 *
 * For v1, workflows are linear — each step gets a consecutive row, column 0.
 * Edges connect step[i] -> step[i+1]. Structure supports future parallel
 * branches by assigning different columns.
 */
export function computeLayout(steps: readonly StepSummary[]): DiagramLayout {
  if (steps.length === 0) {
    return { nodes: [], edges: [], rows: 0, cols: 0 };
  }

  const nodes: LayoutNode[] = steps.map((step, i) => ({
    name: step.name,
    type: step.isApproval ? 'approval' : 'agent',
    agent: step.agent,
    row: i,
    col: 0,
  }));

  const edges: LayoutEdge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({ from: steps[i].name, to: steps[i + 1].name });
  }

  return { nodes, edges, rows: steps.length, cols: 1 };
}
