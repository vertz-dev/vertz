import { css } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';

const s = css({
  page: ['flex', 'flex-col', 'gap:6', { '&': { 'max-width': '960px' } }],
  heading: ['text:2xl', 'font:bold', 'text:foreground', 'm:0'],
  subtitle: ['text:sm', 'text:muted-foreground', { '&': { margin: '4px 0 0' } }],
  grid: ['grid', 'gap:3', 'grid-cols:repeat(2, 1fr)'],
  card: ['p:4', 'rounded:lg', 'border:1', 'border:border', 'bg:card', 'flex', 'flex-col', 'gap:2', 'cursor:pointer', 'transition:border-color 0.15s'],
  cardHeader: ['flex', 'items:center', { '&': { 'justify-content': 'space-between' } }],
  cardTitle: ['text:sm', 'font:medium', 'text:foreground'],
  cardDesc: ['text:sm', 'text:muted-foreground'],
  badge: ['text:xs', 'rounded:full', 'bg:secondary', 'font:medium', { '&': { padding: '2px 8px', color: 'var(--color-secondary-foreground)' } }],
  toolCount: ['text:xs', 'text:muted-foreground'],
  loading: ['text:muted-foreground', 'text:sm'],
  error: ['text:destructive', 'text:sm'],
});

export default function AgentsPage() {
  const { navigate } = useRouter();
  const agentsQuery = query(
    () => sdk.agents.list(),
    { key: 'agents-list' },
  );

  const agents = () => agentsQuery.data?.agents ?? [];

  return (
    <div className={s.page}>
      <div>
        <h1 className={s.heading}>Agents</h1>
        <p className={s.subtitle}>LLM-powered actors in the orchestration pipeline</p>
      </div>

      {agentsQuery.loading && <div className={s.loading}>Loading agents...</div>}
      {agentsQuery.error && <div className={s.error}>Failed to load agents</div>}
      {agents().length > 0 && (
        <div className={s.grid}>
          {agents().map((agent) => (
            <div
              key={agent.name}
              className={s.card}
              onClick={() => navigate({ to: `/agents/${agent.name}` })}
            >
              <div className={s.cardHeader}>
                <div className={s.cardTitle}>{agent.name}</div>
                <span className={s.badge}>{agent.model}</span>
              </div>
              <div className={s.cardDesc}>{agent.description}</div>
              <div className={s.toolCount}>{agent.toolCount} tools</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
