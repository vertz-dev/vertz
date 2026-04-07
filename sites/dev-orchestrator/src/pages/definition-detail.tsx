import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import type { AgentDetail } from '../api/services/definitions';
import WorkflowDiagram from '../ui/components/workflow-diagram';
import { sdk } from '../lib/sdk';

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
    width: '320px',
    flexShrink: '0',
    borderLeft: '1px solid var(--color-border)',
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  panelTitle: { fontSize: '16px', fontWeight: '600' as const, color: 'var(--color-foreground)' },
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

function AgentPanel({ detail }: { detail: AgentDetail }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>{detail.name}</div>
      {detail.description && (
        <div>
          <div style={styles.label}>Description</div>
          <div style={styles.value}>{detail.description}</div>
        </div>
      )}
      <div>
        <div style={styles.label}>Model</div>
        <div style={styles.value}>{detail.model}</div>
      </div>
      <div>
        <div style={styles.label}>Max Iterations</div>
        <div style={styles.value}>{detail.maxIterations}</div>
      </div>
      <div>
        <div style={styles.label}>System Prompt</div>
        <div style={styles.prompt}>{detail.systemPrompt}</div>
      </div>
      {detail.tools.length > 0 && (
        <div>
          <div style={styles.label}>Tools ({detail.tools.length})</div>
          <div style={styles.tools}>
            {detail.tools.map((tool) => (
              <span key={tool} style={styles.toolBadge}>{tool}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DefinitionDetailPage() {
  const { name } = useParams<'/definitions/:name'>();
  const { navigate } = useRouter();
  let selectedStep: string | undefined;

  const defQuery = query(
    () => sdk.definitions.get({ name }),
    { key: `definition-${name}` },
  );

  const definition = () => defQuery.data;
  const selectedAgent = (): AgentDetail | null => {
    if (!selectedStep || !definition()) return null;
    const step = definition()!.steps.find((s) => s.name === selectedStep);
    return step?.agentDetail ?? null;
  };

  return (
    <div style={styles.page}>
      <div style={styles.main}>
        <button style={styles.backBtn} onClick={() => navigate({ to: '/definitions' })}>
          &larr; Back to definitions
        </button>
        <h1 style={styles.heading}>{name}</h1>
        {defQuery.loading && <div style={styles.loading}>Loading...</div>}
        {definition() && (
          <WorkflowDiagram
            definition={definition()!}
            selectedStep={selectedStep}
            onStepSelect={(step) => { selectedStep = step; }}
          />
        )}
      </div>
      {selectedAgent() && <AgentPanel detail={selectedAgent()!} />}
    </div>
  );
}
