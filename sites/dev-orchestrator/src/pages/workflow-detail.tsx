import { query } from '@vertz/ui/query';
import { useParams } from '@vertz/ui/router';
import type { WorkflowRun } from '../api/services/workflows';
import { sdk } from '../lib/sdk';

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
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderLeft: '2px solid var(--color-border)',
  },
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderLeft: '2px solid var(--color-primary)',
    background: 'var(--color-accent)',
  },
  stepDone: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderLeft: '2px solid var(--color-primary)',
  },
  stepName: { fontSize: '13px', fontWeight: '500', color: 'var(--color-foreground)', flex: '1' },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    background: 'var(--color-secondary)',
    color: 'var(--color-secondary-foreground)',
    fontWeight: '500',
  },
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
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
  error: { color: 'var(--color-destructive)', fontSize: '13px' },
};

function stepStatus(stepName: string, currentStep: string): 'done' | 'active' | 'pending' {
  const currentIdx = WORKFLOW_STEPS.indexOf(currentStep as typeof WORKFLOW_STEPS[number]);
  const stepIdx = WORKFLOW_STEPS.indexOf(stepName as typeof WORKFLOW_STEPS[number]);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

export default function WorkflowDetailPage() {
  const { id } = useParams<'/workflows/:id'>();
  let approving = false;

  const workflowQuery = query(
    () => sdk.workflows.get({ id }),
    { refetchInterval: 3000 },
  );

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
            const status = stepStatus(stepName, workflow()!.currentStep);
            const stepStyle = status === 'active'
              ? s.stepActive
              : status === 'done'
                ? s.stepDone
                : s.step;

            return (
              <div key={stepName} style={stepStyle}>
                <span style={s.stepName}>{stepName}</span>
                <span style={s.badge}>
                  {status === 'done' ? 'done' : status === 'active' ? 'running' : 'pending'}
                </span>
                {stepName === 'human-approval' && status === 'active' && (
                  <button style={s.btn} onClick={handleApprove} disabled={approving}>
                    {approving ? 'Approving...' : 'Approve'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
