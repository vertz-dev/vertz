import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import WorkflowDiagram from '../ui/components/workflow-diagram';
import { buildOverlay } from '../ui/components/live-overlay-utils';
import type { StepProgressEvent } from '../ui/lib/sse-client';
import { createWorkflowStream } from '../ui/lib/sse-client';
import { sdk } from '../lib/sdk';
import { resolveSelectedAgent, toggleStep } from './definition-detail-utils';

const styles = {
  page: { display: 'flex', gap: '24px', maxWidth: '1200px' },
  main: { flex: '1', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  heading: { fontSize: '24px', fontWeight: '700', color: 'var(--color-foreground)', margin: '0' },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: 'var(--color-muted-foreground)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
  },
  panel: {
    position: 'relative' as const,
    width: '320px',
    flexShrink: '0',
    borderLeft: '1px solid var(--color-border)',
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  panelTitle: { fontSize: '16px', fontWeight: '600' as const, color: 'var(--color-foreground)' },
  closeBtn: {
    position: 'absolute' as const,
    top: '0',
    right: '0',
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: 'var(--color-muted-foreground)',
    padding: '4px 8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    color: 'var(--color-muted-foreground)',
    marginBottom: '4px',
  },
  value: { fontSize: '13px', color: 'var(--color-foreground)' },
  prompt: {
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    padding: '8px 12px',
    background: 'var(--color-secondary)',
    borderRadius: '6px',
    maxHeight: '200px',
    overflow: 'auto',
    color: 'var(--color-foreground)',
  },
  tools: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  toolBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    background: 'var(--color-secondary)',
    color: 'var(--color-secondary-foreground)',
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
};


export default function DefinitionDetailPage() {
  const { name } = useParams<'/definitions/:name'>();
  const { navigate } = useRouter();
  let selectedStep: string | undefined;

  let sseEvents: StepProgressEvent[] = [];

  const defQuery = query(
    () => sdk.definitions.get({ name }),
    { key: `definition-${name}` },
  );

  // Check for an active run of this definition
  const activeRunQuery = query(
    () => sdk.workflows.list({ status: 'running', page: 1, pageSize: 1 }),
    { key: `active-run-${name}`, refetchInterval: 10000 },
  );

  const activeRun = (): WorkflowRun | null => {
    const runs = activeRunQuery.data?.runs ?? [];
    return runs[0] ?? null;
  };

  // Subscribe to SSE for the active run
  const activeRunId = activeRun()?.id;
  if (activeRunId) {
    const stream = createWorkflowStream(activeRunId);
    stream.subscribe((event) => {
      sseEvents = [...sseEvents, event];
    });
  }

  const definition = () => defQuery.data;
  const selectedAgent = () => resolveSelectedAgent(definition(), selectedStep);

  const liveOverlay = () => {
    const run = activeRun();
    if (!run || !definition()) return undefined;
    const stepNames = definition()!.steps.map((s) => s.name);
    return buildOverlay(stepNames, run.currentStep, sseEvents);
  };

  const handleStepSelect = (step: string) => {
    selectedStep = toggleStep(selectedStep, step);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') selectedStep = undefined;
  };

  return (
    <div style={styles.page} onKeyDown={handleKeyDown}>
      <div style={styles.main}>
        <button style={styles.backBtn} onClick={() => navigate({ to: '/definitions' })}>
          &larr; Back to definitions
        </button>
        <h1 style={styles.heading}>{name}</h1>
        {defQuery.loading && <div style={styles.loading}>Loading...</div>}
        {defQuery.error && <div style={styles.loading}>Failed to load definition.</div>}
        {definition() && (
          <WorkflowDiagram
            definition={definition()!}
            activeRun={liveOverlay()}
            selectedStep={selectedStep}
            onStepSelect={handleStepSelect}
          />
        )}
      </div>
      {selectedAgent() && (
        <div style={styles.panel}>
          <button
            style={styles.closeBtn}
            onClick={() => { selectedStep = undefined; }}
            aria-label="Close panel"
          >
            &times;
          </button>
          <div style={styles.panelTitle}>{selectedAgent()!.name}</div>
          {selectedAgent()!.description && (
            <div>
              <div style={styles.label}>Description</div>
              <div style={styles.value}>{selectedAgent()!.description}</div>
            </div>
          )}
          <div>
            <div style={styles.label}>Model</div>
            <div style={styles.value}>{selectedAgent()!.model}</div>
          </div>
          <div>
            <div style={styles.label}>Max Iterations</div>
            <div style={styles.value}>{selectedAgent()!.maxIterations}</div>
          </div>
          <div>
            <div style={styles.label}>System Prompt</div>
            <div style={styles.prompt}>{selectedAgent()!.systemPrompt}</div>
          </div>
          {selectedAgent()!.tools.length > 0 && (
            <div>
              <div style={styles.label}>Tools ({selectedAgent()!.tools.length})</div>
              <div style={styles.tools}>
                {selectedAgent()!.tools.map((tool) => (
                  <span key={tool} style={styles.toolBadge}>{tool}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
