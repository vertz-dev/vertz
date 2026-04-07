import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';

const styles = {
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
    cursor: 'pointer',
    transition: 'border-color 0.15s',
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
  toolCount: { fontSize: '11px', color: 'var(--color-muted-foreground)' },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
  error: { color: 'var(--color-destructive)', fontSize: '13px' },
};

export default function AgentsPage() {
  const { navigate } = useRouter();
  const agentsQuery = query(
    () => sdk.agents.list(),
    { key: 'agents-list' },
  );

  const agents = () => agentsQuery.data?.agents ?? [];

  return (
    <div style={styles.page}>
      <div>
        <h1 style={styles.heading}>Agents</h1>
        <p style={styles.subtitle}>LLM-powered actors in the orchestration pipeline</p>
      </div>

      {agentsQuery.loading && <div style={styles.loading}>Loading agents...</div>}
      {agentsQuery.error && <div style={styles.error}>Failed to load agents</div>}
      {agents().length > 0 && (
        <div style={styles.grid}>
          {agents().map((agent) => (
            <div
              key={agent.name}
              style={styles.card}
              onClick={() => navigate({ to: `/agents/${agent.name}` })}
            >
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>{agent.name}</div>
                <span style={styles.badge}>{agent.model}</span>
              </div>
              <div style={styles.cardDesc}>{agent.description}</div>
              <div style={styles.toolCount}>{agent.toolCount} tools</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
