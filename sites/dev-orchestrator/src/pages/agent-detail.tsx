import { css } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useParams, useRouter } from '@vertz/ui/router';
import PromptEditor from '../ui/components/prompt-editor';
import { sdk } from '../lib/sdk';
import { saveStatusMessage, saveStatusColor } from './agent-detail-utils';
import type { SaveStatus } from './agent-detail-utils';

const s = css({
  page: ['flex', 'flex-col', 'gap:5', { '&': { 'max-width': '960px' } }],
  heading: ['text:2xl', 'font:bold', 'text:foreground', 'm:0'],
  backBtn: [
    'inline-flex',
    'items:center',
    'gap:1',
    'text:sm',
    'text:muted-foreground',
    'cursor:pointer',
    { '&': { background: 'none', border: 'none', padding: '4px 0' } },
  ],
  meta: ['flex', 'gap:6', 'text:sm', 'text:muted-foreground'],
  metaLabel: ['font:semibold'],
  section: ['flex', 'flex-col', 'gap:2'],
  sectionTitle: ['text:base', 'font:semibold', 'text:foreground'],
  tools: ['flex', 'gap:2', 'flex-wrap'],
  toolCard: [
    'rounded:md',
    'border:1',
    'border:border',
    'bg:card',
    { '&': { padding: '8px 12px', 'font-size': '12px' } },
  ],
  toolName: ['font:semibold', 'text:foreground'],
  toolDesc: ['text:muted-foreground', { '&': { 'font-size': '11px', 'margin-top': '2px' } }],
  saveRow: ['flex', 'items:center', 'gap:3'],
  saveBtn: [
    'text:sm',
    'font:medium',
    'rounded:md',
    'bg:primary',
    'cursor:pointer',
    { '&': { padding: '6px 16px', border: 'none', color: 'var(--color-primary-foreground)' } },
  ],
  loading: ['text:sm', 'text:muted-foreground'],
  description: ['text:sm', 'text:muted-foreground'],
  saveStatus: [{ '&': { 'font-size': '12px' } }],
});

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
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => navigate({ to: '/agents' })}>
        &larr; Back to agents
      </button>

      {agentQuery.loading && <div className={s.loading}>Loading...</div>}
      {agentQuery.error && <div className={s.loading}>Failed to load agent.</div>}

      {agent() && (
        <>
          <h1 className={s.heading}>{agent()!.name}</h1>
          {agent()!.description && (
            <div className={s.description}>
              {agent()!.description}
            </div>
          )}

          <div className={s.meta}>
            <div><span className={s.metaLabel}>Model: </span>{agent()!.model}</div>
            <div><span className={s.metaLabel}>Max Iterations: </span>{agent()!.maxIterations}</div>
            {agent()!.tokenBudget && (
              <div><span className={s.metaLabel}>Token Budget: </span>{agent()!.tokenBudget!.max.toLocaleString()}</div>
            )}
          </div>

          <div className={s.section}>
            <div className={s.sectionTitle}>System Prompt</div>
            <PromptEditor
              value={editedPrompt ?? agent()!.systemPrompt}
              onChange={handlePromptChange}
            />
            <div className={s.saveRow}>
              <button className={s.saveBtn} onClick={handleSave}>Save Prompt</button>
              <span className={s.saveStatus} style={{ color: saveStatusColor(saveStatus) }}>
                {saveStatusMessage(saveStatus)}
              </span>
            </div>
          </div>

          {agent()!.tools.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionTitle}>Tools ({agent()!.tools.length})</div>
              <div className={s.tools}>
                {agent()!.tools.map((tool) => (
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
