import { css } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import ArtifactViewer from '../components/artifact-viewer';
import StepCard from '../components/step-card';
import ToolCallLog from '../components/tool-call-log';
import { sdk } from '../lib/sdk';
import { errorReasonLabel, filterArtifactsByStep, stepStatusFromDetail } from './step-inspector-utils';

const s = css({
  page: ['flex', 'flex-col', 'gap:5', { '&': { 'max-width': '960px' } }],
  backBtn: [
    'inline-flex',
    'items:center',
    'gap:1',
    'text:sm',
    'text:muted-foreground',
    'cursor:pointer',
    { '&': { background: 'none', border: 'none', padding: '4px 0' } },
  ],
  section: ['flex', 'flex-col', 'gap:2'],
  sectionTitle: ['font:semibold', 'text:foreground', { '&': { 'font-size': '14px' } }],
  response: [
    'text:sm',
    'text:foreground',
    'bg:secondary',
    'rounded:lg',
    { '&': { padding: '12px 16px', 'line-height': '1.6', 'white-space': 'pre-wrap' } },
  ],
  loading: ['text:sm', 'text:muted-foreground'],
  errorBanner: [
    'flex',
    'flex-col',
    'gap:2',
    'rounded:lg',
    { '&': { padding: '12px 16px', background: 'hsl(0, 84%, 60%, 0.1)', border: '1px solid hsl(0, 84%, 60%, 0.3)' } },
  ],
  errorRow: ['flex', 'items:center', 'gap:2'],
  errorMessage: [
    'text:sm',
    'font:medium',
    { '&': { color: 'hsl(0, 84%, 60%)' } },
  ],
  errorDetail: ['text:muted-foreground', { '&': { 'font-size': '12px' } }],
  reasonBadge: [
    'rounded:full',
    'font:medium',
    { '&': { display: 'inline-block', 'font-size': '11px', padding: '2px 8px', background: 'hsl(0, 84%, 60%, 0.15)', color: 'hsl(0, 84%, 60%)' } },
  ],
});

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
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => navigate({ to: `/workflows/${id}` })}>
        ← Back to workflow
      </button>

      {detailQuery.loading && <div className={s.loading}>Loading step details...</div>}

      {detail() && (
        <>
          <StepCard
            name={step}
            status={stepStatusFromDetail(detail()!)}
            detail={detail()!}
          />

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
