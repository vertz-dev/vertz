import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import StepCard from '../components/step-card';
import { sdk } from '../lib/sdk';
import type { StepProgressEvent } from '../ui/lib/sse-client';
import { createWorkflowStream } from '../ui/lib/sse-client';
import { WORKFLOW_STEPS, stepStatus } from './workflow-detail-utils';

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
  actions: { display: 'flex', gap: '8px', alignItems: 'center' },
  cancelBtn: {
    height: '32px',
    padding: '0 14px',
    borderRadius: '6px',
    border: '1px solid hsl(0, 84%, 60%)',
    background: 'transparent',
    color: 'hsl(0, 84%, 60%)',
    fontSize: '13px',
    fontWeight: '500' as const,
    cursor: 'pointer',
  },
  retryBtn: {
    height: '32px',
    padding: '0 14px',
    borderRadius: '6px',
    border: '1px solid var(--color-primary)',
    background: 'transparent',
    color: 'var(--color-primary)',
    fontSize: '13px',
    fontWeight: '500' as const,
    cursor: 'pointer',
  },
};

export default function WorkflowDetailPage() {
  const { id } = useParams<'/workflows/:id'>();
  const { navigate } = useRouter();
  let approving = false;
  let cancelling = false;
  let retrying = false;
  let sseEvents: StepProgressEvent[] = [];

  const workflowQuery = query(
    () => sdk.workflows.get({ id }),
    { key: `workflow-${id}` },
  );

  // SSE live updates — close on page teardown
  const stream = createWorkflowStream(id);
  stream.subscribe((event) => {
    sseEvents = [...sseEvents, event];
    // Refetch workflow data when a step completes or fails
    if (event.type === 'step-completed' || event.type === 'step-failed') {
      workflowQuery.refetch();
    }
  });

  const handleApprove = async () => {
    approving = true;
    await sdk.workflows.approve({ id });
    approving = false;
    workflowQuery.refetch();
  };

  const handleCancel = async () => {
    cancelling = true;
    await sdk.workflows.cancel({ id });
    cancelling = false;
    workflowQuery.refetch();
  };

  const handleRetry = async () => {
    retrying = true;
    const newRun = await sdk.workflows.retry({ id });
    retrying = false;
    if (newRun) {
      navigate({ to: `/workflows/${newRun.id}` });
    } else {
      workflowQuery.refetch();
    }
  };

  const workflow = () => workflowQuery.data as WorkflowRun | null | undefined;

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.heading}>Workflow {id}</h1>
        {workflowQuery.loading && <div style={s.loading}>Loading...</div>}
        {workflowQuery.error && <div style={s.error}>Failed to load workflow</div>}
        {workflow() && (
          <>
            <p style={s.meta}>
              Issue #{workflow()!.issueNumber} &middot; {workflow()!.repo} &middot; {workflow()!.status}
            </p>
            <div style={s.actions}>
              {(workflow()!.status === 'running' || workflow()!.status === 'waiting-approval') && (
                <button style={s.cancelBtn} onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
              {(workflow()!.status === 'failed' || workflow()!.status === 'cancelled') && (
                <button style={s.retryBtn} onClick={handleRetry} disabled={retrying}>
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
            </div>
          </>
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
