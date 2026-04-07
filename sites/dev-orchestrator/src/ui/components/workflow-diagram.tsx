import type { DefinitionDetail } from '../../api/services/definitions';
import { computeLayout } from '../lib/workflow-layout';
import { NODE_GAP, NODE_HEIGHT } from './edge-line-utils';
import EdgeLine from './edge-line';
import StepNode from './step-node';

export interface WorkflowDiagramProps {
  readonly definition: DefinitionDetail;
  readonly activeRun?: {
    readonly currentStep: string;
    readonly stepStatuses: Record<string, 'pending' | 'active' | 'completed' | 'failed'>;
  };
  readonly selectedStep?: string;
  readonly onStepSelect?: (step: string) => void;
}

const styles = {
  container: {
    position: 'relative' as const,
    paddingLeft: '40px',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    marginBottom: `${NODE_GAP}px`,
  },
};

export default function WorkflowDiagram({
  definition,
  activeRun,
  selectedStep,
  onStepSelect,
}: WorkflowDiagramProps) {
  const layout = computeLayout(definition.steps);
  const totalHeight = layout.rows * (NODE_HEIGHT + NODE_GAP);

  return (
    <div style={{ ...styles.container, minHeight: `${totalHeight}px` }}>
      {layout.edges.map((edge) => {
        const fromNode = layout.nodes.find((n) => n.name === edge.from);
        const toNode = layout.nodes.find((n) => n.name === edge.to);
        if (!fromNode || !toNode) return null;
        const fromStatus = activeRun?.stepStatuses[edge.from];
        const toStatus = activeRun?.stepStatuses[edge.to];
        const isActive = fromStatus === 'completed' && toStatus === 'active';
        const edgeStatus = fromStatus === 'completed' && toStatus === 'completed'
          ? 'completed' as const
          : isActive ? 'active' as const : 'pending' as const;
        return (
          <EdgeLine
            key={`${edge.from}-${edge.to}`}
            fromRow={fromNode.row}
            toRow={toNode.row}
            animated={isActive}
            status={activeRun ? edgeStatus : undefined}
          />
        );
      })}
      <div style={styles.grid}>
        {layout.nodes.map((node) => (
          <div key={node.name} style={styles.row}>
            <StepNode
              name={node.name}
              type={node.type}
              agent={node.agent}
              selected={selectedStep === node.name}
              status={activeRun?.stepStatuses[node.name]}
              onClick={() => onStepSelect?.(node.name)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
