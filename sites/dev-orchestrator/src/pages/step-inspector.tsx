import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import ArtifactViewer from '../components/artifact-viewer';
import StepCard from '../components/step-card';
import ToolCallLog from '../components/tool-call-log';
import { sdk } from '../lib/sdk';
import {
  errorReasonLabel,
  filterArtifactsByStep,
  stepStatusFromDetail,
} from './step-inspector-utils';

const s = css({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[5],
    '&': { maxWidth: '960px' },
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
  section: { display: 'flex', flexDirection: 'column', gap: token.spacing[2] },
  sectionTitle: {
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    '&': { fontSize: '14px' },
  },
  response: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    borderRadius: token.radius.lg,
    '&': { padding: '12px 16px', lineHeight: '1.6', whiteSpace: 'pre-wrap' },
  },
  loading: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  errorBanner: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    borderRadius: token.radius.lg,
    '&': {
      padding: '12px 16px',
      background: 'hsl(0, 84%, 60%, 0.1)',
      border: '1px solid hsl(0, 84%, 60%, 0.3)',
    },
  },
  errorRow: { display: 'flex', alignItems: 'center', gap: token.spacing[2] },
  errorMessage: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    '&': { color: 'hsl(0, 84%, 60%)' },
  },
  errorDetail: { color: token.color['muted-foreground'], '&': { fontSize: '12px' } },
  reasonBadge: {
    borderRadius: token.radius.full,
    fontWeight: token.font.weight.medium,
    '&': {
      display: 'inline-block',
      fontSize: '11px',
      padding: '2px 8px',
      background: 'hsl(0, 84%, 60%, 0.15)',
      color: 'hsl(0, 84%, 60%)',
    },
  },
});

export default function StepInspectorPage() {
  const { id, step } = useParams<'/workflows/:id/steps/:step'>();
  const { navigate } = useRouter();

  const detailQuery = query(() => sdk.workflows.stepDetail({ runId: id, step }), {
    key: `step-detail-${id}-${step}`,
  });

  const artifactsQuery = query(() => sdk.workflows.artifacts({ runId: id }), {
    key: `artifacts-${id}`,
  });

  const detail = () => detailQuery.data;
  const stepArtifacts = () => {
    const all = artifactsQuery.data;
    if (!all) return [];
    return filterArtifactsByStep(all.artifacts, step);
  };

  return (
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => navigate({ to: `/workflows/${id}` })}>
        ← Back to workflow
      </button>

      {detailQuery.loading && <div className={s.loading}>Loading step details...</div>}

      {detail() && (
        <>
          <StepCard name={step} status={stepStatusFromDetail(detail()!)} detail={detail()!} />

          {detail()!.errorMessage && (
            <div className={s.errorBanner}>
              <div className={s.errorRow}>
                <div className={s.errorMessage}>{detail()!.errorMessage}</div>
                {detail()!.errorReason && (
                  <span className={s.reasonBadge}>{errorReasonLabel(detail()!.errorReason)}</span>
                )}
              </div>
              {detail()!.lastToolCall && (
                <div className={s.errorDetail}>
                  Last tool call: <code>{detail()!.lastToolCall}</code>
                </div>
              )}
            </div>
          )}

          {detail()!.output && (
            <div className={s.section}>
              <div className={s.sectionTitle}>Response</div>
              <div className={s.response}>{detail()!.output}</div>
            </div>
          )}
        </>
      )}

      {stepArtifacts().length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Artifacts</div>
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

      <div className={s.section}>
        <div className={s.sectionTitle}>Tool Calls</div>
        <ToolCallLog calls={[]} />
      </div>
    </div>
  );
}
