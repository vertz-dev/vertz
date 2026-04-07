import { css } from '@vertz/ui';
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
  page: ['flex', 'gap:6', { '&': { 'max-width': '1200px' } }],
  main: ['flex-1', 'flex', 'flex-col', 'gap:4'],
  heading: ['text:foreground', 'font:bold', 'm:0', { '&': { 'font-size': '24px' } }],
  backBtn: [
    'inline-flex',
    'items:center',
    'gap:1',
    'text:sm',
    'text:muted-foreground',
    'cursor:pointer',
    { '&': { background: 'none', border: 'none', padding: '4px 0' } },
  ],
  panel: [
    'relative',
    'flex',
    'flex-col',
    'gap:3',
    'shrink-0',
    { '&': { width: '320px', 'border-left': '1px solid var(--color-border)', 'padding-left': '20px' } },
  ],
  panelTitle: ['font:semibold', 'text:foreground', { '&': { 'font-size': '16px' } }],
  closeBtn: [
    'absolute',
    'text:muted-foreground',
    'cursor:pointer',
    { '&': { top: '0', right: '0', background: 'none', border: 'none', 'font-size': '18px', padding: '4px 8px' } },
  ],
  label: ['font:semibold', 'text:muted-foreground', 'uppercase', { '&': { 'font-size': '11px', 'margin-bottom': '4px' } }],
  value: ['text:sm', 'text:foreground'],
  prompt: [
    'text:xs',
    'text:foreground',
    'bg:secondary',
    'rounded:md',
    'overflow:auto',
    {
      '&': {
        'font-family': 'monospace',
        'white-space': 'pre-wrap',
        'word-break': 'break-word',
        padding: '8px 12px',
        'max-height': '200px',
      },
    },
  ],
  tools: ['flex', 'flex-wrap', { '&': { gap: '4px' } }],
  toolBadge: ['text:xs', 'rounded:full', 'bg:secondary', { '&': { padding: '2px 8px', color: 'var(--color-secondary-foreground)' } }],
  loading: ['text:muted-foreground', 'text:sm'],
});


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
          &larr; Back to definitions
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
            onClick={() => { selectedStep = undefined; }}
            aria-label="Close panel"
          >
            &times;
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
                  <span key={tool} className={s.toolBadge}>{tool}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
