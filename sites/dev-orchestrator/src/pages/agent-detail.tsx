import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';
import PromptEditor from '../ui/components/prompt-editor';
import type { SaveStatus } from './agent-detail-utils';
import { saveStatusColor, saveStatusMessage } from './agent-detail-utils';

const s = css({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[5],
    '&': { maxWidth: '960px' },
  },
  heading: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    margin: token.spacing[0],
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
  meta: {
    display: 'flex',
    gap: token.spacing[6],
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
  },
  metaLabel: { fontWeight: token.font.weight.semibold },
  section: { display: 'flex', flexDirection: 'column', gap: token.spacing[2] },
  sectionTitle: {
    fontSize: token.font.size.base,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
  },
  tools: { display: 'flex', gap: token.spacing[2], flexWrap: 'wrap' },
  toolCard: {
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
    '&': { padding: '8px 12px', fontSize: '12px' },
  },
  toolName: { fontWeight: token.font.weight.semibold, color: token.color.foreground },
  toolDesc: { color: token.color['muted-foreground'], '&': { fontSize: '11px', marginTop: '2px' } },
  saveRow: { display: 'flex', alignItems: 'center', gap: token.spacing[3] },
  saveBtn: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    borderRadius: token.radius.md,
    backgroundColor: token.color.primary,
    cursor: 'pointer',
    '&': { padding: '6px 16px', border: 'none', color: 'var(--color-primary-foreground)' },
  },
  loading: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  description: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  saveStatus: [{ '&': { 'font-size': '12px' } }],
});

export default function AgentDetailPage() {
  const { name } = useParams<'/agents/:name'>();
  const { navigate } = useRouter();
  let editedPrompt: string | undefined = undefined;
  let saveStatus: SaveStatus = 'idle';

  const agentQuery = query(() => sdk.agents.get({ name }), {
    key: `agent-${name}`,
  });

  const handlePromptChange = (value: string) => {
    editedPrompt = value;
    saveStatus = 'idle';
  };

  const handleSave = async () => {
    const currentPrompt = editedPrompt ?? agentQuery.data?.systemPrompt;
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
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => navigate({ to: '/agents' })}>
        ← Back to agents
      </button>

      {agentQuery.loading && <div className={s.loading}>Loading...</div>}
      {agentQuery.error && <div className={s.loading}>Failed to load agent.</div>}

      {agentQuery.data && (
        <>
          <h1 className={s.heading}>{agentQuery.data.name}</h1>
          {agentQuery.data.description && (
            <div className={s.description}>{agentQuery.data.description}</div>
          )}

          <div className={s.meta}>
            <div>
              <span className={s.metaLabel}>Model: </span>
              {agentQuery.data.model}
            </div>
            <div>
              <span className={s.metaLabel}>Max Iterations: </span>
              {agentQuery.data.maxIterations}
            </div>
            {agentQuery.data.tokenBudget && (
              <div>
                <span className={s.metaLabel}>Token Budget: </span>
                {agentQuery.data.tokenBudget!.max.toLocaleString()}
              </div>
            )}
          </div>

          <div className={s.section}>
            <div className={s.sectionTitle}>System Prompt</div>
            <PromptEditor
              value={editedPrompt ?? agentQuery.data?.systemPrompt ?? ''}
              onChange={handlePromptChange}
            />
            <div className={s.saveRow}>
              <button className={s.saveBtn} onClick={handleSave}>
                Save Prompt
              </button>
              <span className={s.saveStatus} style={{ color: saveStatusColor(saveStatus) }}>
                {saveStatusMessage(saveStatus)}
              </span>
            </div>
          </div>

          {agentQuery.data.tools.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionTitle}>Tools ({agentQuery.data.tools.length})</div>
              <div className={s.tools}>
                {agentQuery.data.tools.map((tool) => (
                  <div key={tool.name} className={s.toolCard}>
                    <div className={s.toolName}>{tool.name}</div>
                    {tool.description && <div className={s.toolDesc}>{tool.description}</div>}
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
