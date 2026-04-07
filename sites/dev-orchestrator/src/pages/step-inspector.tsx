import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import ArtifactViewer from '../components/artifact-viewer';
import StepCard from '../components/step-card';
import ToolCallLog from '../components/tool-call-log';
import { sdk } from '../lib/sdk';
import { errorReasonLabel, filterArtifactsByStep, stepStatusFromDetail } from './step-inspector-utils';

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    maxWidth: '960px',
  },
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
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600' as const,
    color: 'var(--color-foreground)',
  },
  response: {
    padding: '12px 16px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: 'var(--color-foreground)',
    background: 'var(--color-secondary)',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap' as const,
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
  errorBanner: {
    padding: '12px 16px',
    background: 'hsl(0, 84%, 60%, 0.1)',
    border: '1px solid hsl(0, 84%, 60%, 0.3)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  errorMessage: {
    fontSize: '13px',
    color: 'hsl(0, 84%, 60%)',
    fontWeight: '500' as const,
  },
  errorDetail: {
    fontSize: '12px',
    color: 'var(--color-muted-foreground)',
  },
  reasonBadge: {
    display: 'inline-block',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    background: 'hsl(0, 84%, 60%, 0.15)',
    color: 'hsl(0, 84%, 60%)',
    fontWeight: '500' as const,
  },
};

export default function StepInspectorPage() {
  const { id, step } = useParams<'/workflows/:id/steps/:step'>();
  const { navigate } = useRouter();

  const detailQuery = query(
    () => sdk.workflows.stepDetail({ runId: id, step }),
    { key: `step-detail-${id}-${step}` },
  );

  const artifactsQuery = query(
    () => sdk.workflows.artifacts({ runId: id }),
    { key: `artifacts-${id}` },
  );

  const detail = () => detailQuery.data;
  const stepArtifacts = () => {
    const all = artifactsQuery.data;
    if (!all) return [];
    return filterArtifactsByStep(all.artifacts, step);
  };

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => navigate({ to: `/workflows/${id}` })}>
        &larr; Back to workflow
      </button>

      {detailQuery.loading && <div style={styles.loading}>Loading step details...</div>}

      {detail() && (
        <>
          <StepCard
            name={step}
            status={stepStatusFromDetail(detail()!)}
            detail={detail()!}
          />

          {detail()!.errorMessage && (
            <div style={styles.errorBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={styles.errorMessage}>{detail()!.errorMessage}</div>
                {detail()!.errorReason && (
                  <span style={styles.reasonBadge}>{errorReasonLabel(detail()!.errorReason)}</span>
                )}
              </div>
              {detail()!.lastToolCall && (
                <div style={styles.errorDetail}>
                  Last tool call: <code>{detail()!.lastToolCall}</code>
                </div>
              )}
            </div>
          )}

          {detail()!.output && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Response</div>
              <div style={styles.response}>{detail()!.output}</div>
            </div>
          )}
        </>
      )}

      {stepArtifacts().length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Artifacts</div>
          {stepArtifacts().map((artifact) => (
            <ArtifactViewer
              key={artifact.path}
              path={artifact.path}
              content={artifact.content}
              type={artifact.type}
            />
          ))}
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Tool Calls</div>
        <ToolCallLog calls={[]} />
      </div>
    </div>
  );
}
