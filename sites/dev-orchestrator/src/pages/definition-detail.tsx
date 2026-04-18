import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import WorkflowDiagram from '../ui/components/workflow-diagram';
import { buildOverlay } from '../ui/components/live-overlay-utils';
import type { StepProgressEvent } from '../ui/lib/sse-client';
import { createWorkflowStream } from '../ui/lib/sse-client';
import { sdk } from '../lib/sdk';
import { resolveSelectedAgent, toggleStep } from './definition-detail-utils';

const s = css({
  page: { display: 'flex', gap: token.spacing[6], '&': { maxWidth: '1200px' } },
  main: { flex: '1 1 0%', display: 'flex', flexDirection: 'column', gap: token.spacing[4] },
  heading: {
    color: token.color.foreground,
    fontWeight: token.font.weight.bold,
    margin: token.spacing[0],
    '&': { fontSize: '24px' },
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing[1],
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    cursor: 'pointer',
    '&': { background: 'none', border: 'none', padding: '4px 0' },
  },
  panel: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[3],
    flexShrink: '0',
    '&': { width: '320px', borderLeft: '1px solid var(--color-border)', paddingLeft: '20px' },
  },
  panelTitle: {
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    '&': { fontSize: '16px' },
  },
  closeBtn: {
    position: 'absolute',
    color: token.color['muted-foreground'],
    cursor: 'pointer',
    '&': {
      top: '0',
      right: '0',
      background: 'none',
      border: 'none',
      fontSize: '18px',
      padding: '4px 8px',
    },
  },
  label: {
    fontWeight: token.font.weight.semibold,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    '&': { fontSize: '11px', marginBottom: '4px' },
  },
  value: { fontSize: token.font.size.sm, color: token.color.foreground },
  prompt: {
    fontSize: token.font.size.xs,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    borderRadius: token.radius.md,
    overflow: 'auto',
    '&': {
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      padding: '8px 12px',
      maxHeight: '200px',
    },
  },
  tools: { display: 'flex', flexWrap: 'wrap', '&': { gap: '4px' } },
  toolBadge: {
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    backgroundColor: token.color.secondary,
    '&': { padding: '2px 8px', color: 'var(--color-secondary-foreground)' },
  },
  loading: { color: token.color['muted-foreground'], fontSize: token.font.size.sm },
});

export default function DefinitionDetailPage() {
  const { name } = useParams<'/definitions/:name'>();
  const { navigate } = useRouter();
  let selectedStep: string | undefined;

  let sseEvents: StepProgressEvent[] = [];

  const defQuery = query(() => sdk.definitions.get({ name }), { key: `definition-${name}` });

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
    const stepNames = definition()!.steps.map((st) => st.name);
    return buildOverlay(stepNames, run.currentStep, sseEvents);
  };

  const handleStepSelect = (step: string) => {
    selectedStep = toggleStep(selectedStep, step);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') selectedStep = undefined;
  };

  return (
    <div className={s.page} onKeyDown={handleKeyDown}>
      <div className={s.main}>
        <button className={s.backBtn} onClick={() => navigate({ to: '/definitions' })}>
          ← Back to definitions
        </button>
        <h1 className={s.heading}>{name}</h1>
        {defQuery.loading && <div className={s.loading}>Loading...</div>}
        {defQuery.error && <div className={s.loading}>Failed to load definition.</div>}
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
        <div className={s.panel}>
          <button
            className={s.closeBtn}
            onClick={() => {
              selectedStep = undefined;
            }}
            aria-label="Close panel"
          >
            ×
          </button>
          <div className={s.panelTitle}>{selectedAgent()!.name}</div>
          {selectedAgent()!.description && (
            <div>
              <div className={s.label}>Description</div>
              <div className={s.value}>{selectedAgent()!.description}</div>
            </div>
          )}
          <div>
            <div className={s.label}>Model</div>
            <div className={s.value}>{selectedAgent()!.model}</div>
          </div>
          <div>
            <div className={s.label}>Max Iterations</div>
            <div className={s.value}>{selectedAgent()!.maxIterations}</div>
          </div>
          <div>
            <div className={s.label}>System Prompt</div>
            <div className={s.prompt}>{selectedAgent()!.systemPrompt}</div>
          </div>
          {selectedAgent()!.tools.length > 0 && (
            <div>
              <div className={s.label}>Tools ({selectedAgent()!.tools.length})</div>
              <div className={s.tools}>
                {selectedAgent()!.tools.map((tool) => (
                  <span key={tool} className={s.toolBadge}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
