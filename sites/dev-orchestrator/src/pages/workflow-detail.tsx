import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import StepCard from '../components/step-card';
import { sdk } from '../lib/sdk';
import type { StepProgressEvent } from '../ui/lib/sse-client';
import { createWorkflowStream } from '../ui/lib/sse-client';

const WORKFLOW_STEPS = [
  'plan',
  'review-dx',
  'review-product',
  'review-technical',
  'human-approval',
  'implement',
  'code-review',
  'ci-monitor',
] as const;

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px', maxWidth: '960px' },
  heading: { fontSize: '24px', fontWeight: '700', color: 'var(--color-foreground)', margin: '0' },
  meta: { fontSize: '13px', color: 'var(--color-muted-foreground)', margin: '4px 0 0' },
  timeline: { display: 'flex', flexDirection: 'column' as const, gap: '0px' },
  btn: {
    height: '32px',
    padding: '0 14px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  approveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
  error: { color: 'var(--color-destructive)', fontSize: '13px' },
};

function stepStatus(
  stepName: string,
  currentStep: string,
  sseEvents: readonly StepProgressEvent[],
): 'pending' | 'active' | 'completed' | 'failed' {
  const completed = sseEvents.find((e) => e.step === stepName && e.type === 'step-completed');
  if (completed) return 'completed';

  const failed = sseEvents.find((e) => e.step === stepName && e.type === 'step-failed');
  if (failed) return 'failed';

  const started = sseEvents.find((e) => e.step === stepName && e.type === 'step-started');
  if (started) return 'active';

  const currentIdx = WORKFLOW_STEPS.indexOf(currentStep as typeof WORKFLOW_STEPS[number]);
  const stepIdx = WORKFLOW_STEPS.indexOf(stepName as typeof WORKFLOW_STEPS[number]);
  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

export { stepStatus };

export default function WorkflowDetailPage() {
  const { id } = useParams<'/workflows/:id'>();
  const { navigate } = useRouter();
  let approving = false;
  let sseEvents: StepProgressEvent[] = [];

  const workflowQuery = query(
    () => sdk.workflows.get({ id }),
    { refetchInterval: 10000 },
  );

  // SSE live updates
  const stream = createWorkflowStream(id);
  stream.subscribe((event) => {
    sseEvents = [...sseEvents, event];
  });

  const handleApprove = async () => {
    approving = true;
    await sdk.workflows.approve({ id });
    approving = false;
    workflowQuery.refetch();
  };

  const workflow = () => workflowQuery.data as WorkflowRun | null | undefined;

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.heading}>Workflow {id}</h1>
        {workflowQuery.loading && <div style={s.loading}>Loading...</div>}
        {workflowQuery.error && <div style={s.error}>Failed to load workflow</div>}
        {workflow() && (
          <p style={s.meta}>
            Issue #{workflow()!.issueNumber} &middot; {workflow()!.repo} &middot; {workflow()!.status}
          </p>
        )}
      </div>

      {workflow() && (
        <div style={s.timeline}>
          {WORKFLOW_STEPS.map((stepName) => {
            const status = stepStatus(stepName, workflow()!.currentStep, sseEvents);
            return (
              <div key={stepName}>
                <StepCard
                  name={stepName}
                  status={status}
                  detail={workflow()!.steps[stepName]}
                  onClick={() => navigate({ to: `/workflows/${id}/steps/${stepName}` })}
                />
                {stepName === 'human-approval' && status === 'active' && (
                  <div style={s.approveRow}>
                    <button style={s.btn} onClick={handleApprove} disabled={approving}>
                      {approving ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
