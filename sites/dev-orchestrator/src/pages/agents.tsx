import { query } from '@vertz/ui/query';
import type { AgentInfo } from '../api/services/dashboard';
import { sdk } from '../lib/sdk';

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px', maxWidth: '960px' },
  heading: { fontSize: '24px', fontWeight: '700', color: 'var(--color-foreground)', margin: '0' },
  subtitle: { fontSize: '13px', color: 'var(--color-muted-foreground)', margin: '4px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  card: {
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-card)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: '14px', fontWeight: '500', color: 'var(--color-foreground)' },
  cardDesc: { fontSize: '13px', color: 'var(--color-muted-foreground)' },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    background: 'var(--color-secondary)',
    color: 'var(--color-secondary-foreground)',
    fontWeight: '500',
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
  error: { color: 'var(--color-destructive)', fontSize: '13px' },
};

export default function AgentsPage() {
  const agentsQuery = query(
    () => sdk.dashboard.listAgents(),
  );

  const agents = () => (agentsQuery.data as { agents: AgentInfo[] } | undefined)?.agents ?? [];

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.heading}>Agents</h1>
        <p style={s.subtitle}>LLM-powered actors in the orchestration pipeline</p>
      </div>

      {agentsQuery.loading && <div style={s.loading}>Loading agents...</div>}
      {agentsQuery.error && <div style={s.error}>Failed to load agents</div>}
      {agents().length > 0 && (
        <div style={s.grid}>
          {agents().map((agent) => (
            <div key={agent.name} style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>{agent.name}</div>
                <span style={s.badge}>{agent.model}</span>
              </div>
              <div style={s.cardDesc}>{agent.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
