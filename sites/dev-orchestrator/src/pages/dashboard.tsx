import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';
import { STATUS_FILTERS, filterLabel } from './dashboard-utils';
import type { StatusFilter } from './dashboard-utils';

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
  statsRow: { display: 'grid', gap: token.spacing[4], gridTemplateColumns: 'repeat(3, 1fr)' },
  statCard: {
    padding: token.spacing[4],
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
  },
  statValue: {
    fontSize: token.font.size['3xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
  },
  statLabel: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    '&': { marginTop: '4px' },
  },
  separator: { backgroundColor: token.color.border, '&': { height: '1px' } },
  section: { display: 'flex', flexDirection: 'column', gap: token.spacing[3] },
  sectionTitle: {
    fontSize: token.font.size.base,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    margin: token.spacing[0],
  },
  triggerForm: { display: 'flex', alignItems: 'flex-end', gap: token.spacing[3] },
  field: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  label: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
  },
  input: {
    paddingInline: token.spacing[3],
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    fontSize: token.font.size.sm,
    '&': { height: '36px', width: '240px', outline: 'none' },
  },
  btn: {
    paddingInline: token.spacing[4],
    borderRadius: token.radius.md,
    borderWidth: '0px',
    backgroundColor: token.color.primary,
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    cursor: 'pointer',
    '&': { height: '36px', color: 'var(--color-primary-foreground)' },
  },
  empty: {
    color: token.color['muted-foreground'],
    fontSize: token.font.size.sm,
    textAlign: 'center',
    '&': { padding: '32px 0' },
  },
  loading: { color: token.color['muted-foreground'], fontSize: token.font.size.sm },
  error: { color: token.color.destructive, fontSize: token.font.size.sm },
  card: {
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
    display: 'flex',
    alignItems: 'center',
    '&': { justifyContent: 'space-between', padding: '14px 16px' },
  },
  cardInfo: { display: 'flex', flexDirection: 'column', '&': { gap: '2px' } },
  cardTitle: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
  },
  cardMeta: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  badge: {
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    backgroundColor: token.color.secondary,
    fontWeight: token.font.weight.medium,
    '&': { padding: '2px 8px', color: 'var(--color-secondary-foreground)' },
  },
  grid: { display: 'flex', flexDirection: 'column', gap: token.spacing[2] },
  filterRow: { display: 'flex', gap: token.spacing[1] },
  filterTab: {
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color['muted-foreground'],
    cursor: 'pointer',
    '&': { padding: '4px 12px' },
  },
  filterTabActive: {
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    borderRadius: token.radius.md,
    borderWidth: '1px',
    backgroundColor: token.color.primary,
    cursor: 'pointer',
    '&': {
      padding: '4px 12px',
      borderColor: 'var(--color-primary)',
      color: 'var(--color-primary-foreground)',
    },
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    '&': { justifyContent: 'space-between' },
  },
  pageBtn: {
    fontSize: token.font.size.xs,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    cursor: 'pointer',
    '&': { padding: '4px 12px', borderRadius: '4px' },
  },
  clickableCard: {
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    '&': { justifyContent: 'space-between', padding: '14px 16px' },
  },
});

export default function DashboardPage() {
  const { navigate } = useRouter();
  let issueNumber = '';
  let submitting = false;
  let statusFilter: StatusFilter = 'all';
  let currentPage = 1;

  const agentsQuery = query(() => sdk.dashboard.listAgents());

  const workflowsQuery = query(
    () =>
      sdk.workflows.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: currentPage,
        pageSize: 20,
      }),
    { key: `workflows-${statusFilter}-${currentPage}`, refetchInterval: 5000 },
  );

  const handleFilterChange = (filter: StatusFilter) => {
    statusFilter = filter;
    currentPage = 1;
    workflowsQuery.refetch();
  };

  const handleTrigger = async () => {
    if (!issueNumber || submitting) return;
    submitting = true;
    const data = await sdk.workflows.start({
      issueNumber: Number(issueNumber),
      repo: 'vertz-dev/vertz',
    });
    submitting = false;
    issueNumber = '';
    workflowsQuery.refetch();
    navigate({ to: `/workflows/${data.id}` });
  };

  const agents = () => agentsQuery.data?.agents ?? [];
  const runs = () => workflowsQuery.data?.runs ?? [];
  const total = () => workflowsQuery.data?.total ?? 0;
  const pageSize = () => workflowsQuery.data?.pageSize ?? 20;
  const totalPages = () => Math.max(1, Math.ceil(total() / pageSize()));

  return (
    <div className={s.page}>
      <div>
        <h1 className={s.heading}>Dashboard</h1>
        <p className={s.subtitle}>Monitor workflows and trigger new runs</p>
      </div>

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <div className={s.statValue}>{agents().length}</div>
          <div className={s.statLabel}>Agents</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statValue}>{runs().length}</div>
          <div className={s.statLabel}>Workflows</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statValue}>{runs().filter((r) => r.status === 'running').length}</div>
          <div className={s.statLabel}>Running</div>
        </div>
      </div>

      <div className={s.separator} />

      <div className={s.section}>
        <h2 className={s.sectionTitle}>Trigger Workflow</h2>
        <div className={s.triggerForm}>
          <div className={s.field}>
            <label className={s.label}>Issue Number</label>
            <input
              className={s.input}
              placeholder="e.g. 42"
              value={issueNumber}
              onInput={(e: Event) => {
                issueNumber = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <button className={s.btn} onClick={handleTrigger} disabled={submitting}>
            {submitting ? 'Starting...' : 'Start Workflow'}
          </button>
        </div>
      </div>

      <div className={s.separator} />

      <div className={s.section}>
        <h2 className={s.sectionTitle}>Workflows</h2>
        <div className={s.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              className={statusFilter === filter ? s.filterTabActive : s.filterTab}
              onClick={() => handleFilterChange(filter)}
            >
              {filterLabel(filter)}
            </button>
          ))}
        </div>
        {workflowsQuery.loading && <span className={s.loading}>Refreshing...</span>}
        {workflowsQuery.error && <div className={s.error}>Failed to load workflows</div>}
        {runs().length === 0 && !workflowsQuery.loading && (
          <div className={s.empty}>
            {statusFilter === 'all'
              ? 'No workflows yet. Start one by entering an issue number.'
              : `No ${filterLabel(statusFilter).toLowerCase()} workflows.`}
          </div>
        )}
        {runs().length > 0 && (
          <>
            <div className={s.grid}>
              {runs().map((run) => (
                <div
                  key={run.id}
                  className={s.clickableCard}
                  onClick={() => navigate({ to: `/workflows/${run.id}` })}
                >
                  <div className={s.cardInfo}>
                    <div className={s.cardTitle}>Issue #{run.issueNumber}</div>
                    <div className={s.cardMeta}>
                      {run.repo} · Step: {run.currentStep}
                    </div>
                  </div>
                  <span className={s.badge}>{run.status}</span>
                </div>
              ))}
            </div>
            {totalPages() > 1 && (
              <div className={s.pagination}>
                <button
                  className={s.pageBtn}
                  onClick={() => {
                    currentPage = Math.max(1, currentPage - 1);
                    workflowsQuery.refetch();
                  }}
                  disabled={currentPage <= 1}
                >
                  Prev
                </button>
                <span>
                  Page {currentPage} of {totalPages()} ({total()} total)
                </span>
                <button
                  className={s.pageBtn}
                  onClick={() => {
                    currentPage = Math.min(totalPages(), currentPage + 1);
                    workflowsQuery.refetch();
                  }}
                  disabled={currentPage >= totalPages()}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
