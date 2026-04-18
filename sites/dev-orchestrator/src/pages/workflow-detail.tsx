import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import StepCard from '../components/step-card';
import { sdk } from '../lib/sdk';
import type { StepProgressEvent } from '../ui/lib/sse-client';
import { createWorkflowStream } from '../ui/lib/sse-client';
import { WORKFLOW_STEPS, stepStatus } from './workflow-detail-utils';

const s = css({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[6],
    '&': { maxWidth: '960px' },
  },
  heading: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    margin: token.spacing[0],
  },
  meta: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    '&': { margin: '4px 0 0' },
  },
  timeline: { display: 'flex', flexDirection: 'column', '&': { gap: '0px' } },
  btn: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    borderRadius: token.radius.md,
    backgroundColor: token.color.primary,
    cursor: 'pointer',
    '&': {
      height: '32px',
      padding: '0 14px',
      border: 'none',
      color: 'var(--color-primary-foreground)',
    },
  },
  approveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    paddingBlock: token.spacing[2],
    paddingInline: token.spacing[4],
  },
  loading: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  error: { fontSize: token.font.size.sm, color: token.color.destructive },
  actions: { display: 'flex', gap: token.spacing[2], alignItems: 'center' },
  cancelBtn: {
    fontSize: token.font.size.sm,
    borderRadius: token.radius.md,
    cursor: 'pointer',
    fontWeight: token.font.weight.medium,
    '&': {
      height: '32px',
      padding: '0 14px',
      border: '1px solid hsl(0, 84%, 60%)',
      background: 'transparent',
      color: 'hsl(0, 84%, 60%)',
    },
  },
  retryBtn: {
    fontSize: token.font.size.sm,
    borderRadius: token.radius.md,
    cursor: 'pointer',
    fontWeight: token.font.weight.medium,
    '&': {
      height: '32px',
      padding: '0 14px',
      border: '1px solid var(--color-primary)',
      background: 'transparent',
      color: 'var(--color-primary)',
    },
  },
});

export default function WorkflowDetailPage() {
  const { id } = useParams<'/workflows/:id'>();
  const { navigate } = useRouter();
  let approving = false;
  let cancelling = false;
  let retrying = false;
  let sseEvents: StepProgressEvent[] = [];

  const workflowQuery = query(() => sdk.workflows.get({ id }), { key: `workflow-${id}` });

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
    <div className={s.page}>
      <div>
        <h1 className={s.heading}>Workflow {id}</h1>
        {workflowQuery.loading && <div className={s.loading}>Loading...</div>}
        {workflowQuery.error && <div className={s.error}>Failed to load workflow</div>}
        {workflow() && (
          <>
            <p className={s.meta}>
              Issue #{workflow()!.issueNumber} · {workflow()!.repo} · {workflow()!.status}
            </p>
            <div className={s.actions}>
              {(workflow()!.status === 'running' || workflow()!.status === 'waiting-approval') && (
                <button className={s.cancelBtn} onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
              {(workflow()!.status === 'failed' || workflow()!.status === 'cancelled') && (
                <button className={s.retryBtn} onClick={handleRetry} disabled={retrying}>
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {workflow() && (
        <div className={s.timeline}>
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
                  <div className={s.approveRow}>
                    <button className={s.btn} onClick={handleApprove} disabled={approving}>
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
