import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';

const s = css({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[6],
    '&': { maxWidth: '960px' },
  },
  heading: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    margin: token.spacing[0],
  },
  subtitle: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    '&': { margin: '4px 0 0' },
  },
  grid: { display: 'grid', gap: token.spacing[3], gridTemplateColumns: 'repeat(2, 1fr)' },
  card: {
    padding: token.spacing[4],
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  cardHeader: { display: 'flex', alignItems: 'center', '&': { justifyContent: 'space-between' } },
  cardTitle: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
  },
  cardDesc: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  badge: {
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    backgroundColor: token.color.secondary,
    fontWeight: token.font.weight.medium,
    '&': { padding: '2px 8px', color: 'var(--color-secondary-foreground)' },
  },
  toolCount: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  loading: { color: token.color['muted-foreground'], fontSize: token.font.size.sm },
  error: { color: token.color.destructive, fontSize: token.font.size.sm },
});

export default function AgentsPage() {
  const { navigate } = useRouter();
  const agentsQuery = query(() => sdk.agents.list(), { key: 'agents-list' });

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
