import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import PromptEditor from '../ui/components/prompt-editor';
import { sdk } from '../lib/sdk';
import { saveStatusMessage, saveStatusColor } from './agent-detail-utils';
import type { SaveStatus } from './agent-detail-utils';

const styles = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '20px', maxWidth: '960px' },
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
  meta: { display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--color-muted-foreground)' },
  metaLabel: { fontWeight: '600' as const },
  section: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  sectionTitle: { fontSize: '16px', fontWeight: '600' as const, color: 'var(--color-foreground)' },
  tools: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px' },
  toolCard: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-card)',
    fontSize: '12px',
  },
  toolName: { fontWeight: '600' as const, color: 'var(--color-foreground)' },
  toolDesc: { color: 'var(--color-muted-foreground)', fontSize: '11px', marginTop: '2px' },
  saveRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  saveBtn: {
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: '500' as const,
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
    cursor: 'pointer',
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
};

export default function AgentDetailPage() {
  const { name } = useParams<'/agents/:name'>();
  const { navigate } = useRouter();
  let editedPrompt: string | undefined;
  let saveStatus: SaveStatus = 'idle';

  const agentQuery = query(
    () => sdk.agents.get({ name }),
    { key: `agent-${name}` },
  );

  const agent = () => agentQuery.data;

  const handlePromptChange = (value: string) => {
    editedPrompt = value;
    saveStatus = 'idle';
  };

  const handleSave = async () => {
    const currentPrompt = editedPrompt ?? agent()?.systemPrompt;
    if (!currentPrompt) return;
    saveStatus = 'saving';
    try {
      await sdk.agents.updatePrompt({ name, prompt: currentPrompt });
      saveStatus = 'saved';
    } catch {
      saveStatus = 'error';
    }
  };

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => navigate({ to: '/agents' })}>
        &larr; Back to agents
      </button>

      {agentQuery.loading && <div style={styles.loading}>Loading...</div>}
      {agentQuery.error && <div style={styles.loading}>Failed to load agent.</div>}

      {agent() && (
        <>
          <h1 style={styles.heading}>{agent()!.name}</h1>
          {agent()!.description && (
            <div style={{ fontSize: '13px', color: 'var(--color-muted-foreground)' }}>
              {agent()!.description}
            </div>
          )}

          <div style={styles.meta}>
            <div><span style={styles.metaLabel}>Model: </span>{agent()!.model}</div>
            <div><span style={styles.metaLabel}>Max Iterations: </span>{agent()!.maxIterations}</div>
            {agent()!.tokenBudget && (
              <div><span style={styles.metaLabel}>Token Budget: </span>{agent()!.tokenBudget!.max.toLocaleString()}</div>
            )}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>System Prompt</div>
            <PromptEditor
              value={editedPrompt ?? agent()!.systemPrompt}
              onChange={handlePromptChange}
            />
            <div style={styles.saveRow}>
              <button style={styles.saveBtn} onClick={handleSave}>Save Prompt</button>
              <span style={{ fontSize: '12px', color: saveStatusColor(saveStatus) }}>
                {saveStatusMessage(saveStatus)}
              </span>
            </div>
          </div>

          {agent()!.tools.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Tools ({agent()!.tools.length})</div>
              <div style={styles.tools}>
                {agent()!.tools.map((tool) => (
                  <div key={tool.name} style={styles.toolCard}>
                    <div style={styles.toolName}>{tool.name}</div>
                    {tool.description && <div style={styles.toolDesc}>{tool.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
