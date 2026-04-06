import { query } from "@vertz/ui/query";
import { useRouter } from "@vertz/ui/router";
import { sdk } from "../lib/sdk";

const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    maxWidth: "960px",
  },
  heading: {
    fontSize: "24px",
    fontWeight: "700",
    color: "var(--color-foreground)",
    margin: "0",
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--color-muted-foreground)",
    margin: "4px 0 0",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
  },
  statCard: {
    padding: "16px",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    background: "var(--color-card)",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "700",
    color: "var(--color-foreground)",
  },
  statLabel: {
    fontSize: "11px",
    color: "var(--color-muted-foreground)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: "4px",
  },
  separator: { height: "1px", background: "var(--color-border)" },
  section: { display: "flex", flexDirection: "column" as const, gap: "12px" },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "var(--color-foreground)",
    margin: "0",
  },
  triggerForm: { display: "flex", alignItems: "flex-end", gap: "12px" },
  field: { display: "flex", flexDirection: "column" as const, gap: "4px" },
  label: {
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--color-foreground)",
  },
  input: {
    height: "36px",
    padding: "0 12px",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-background)",
    color: "var(--color-foreground)",
    fontSize: "13px",
    width: "240px",
    outline: "none",
  },
  btn: {
    height: "36px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "none",
    background: "var(--color-primary)",
    color: "var(--color-primary-foreground)",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
  },
  empty: {
    color: "var(--color-muted-foreground)",
    fontSize: "13px",
    padding: "32px 0",
    textAlign: "center" as const,
  },
  loading: { color: "var(--color-muted-foreground)", fontSize: "13px" },
  error: { color: "var(--color-destructive)", fontSize: "13px" },
  card: {
    padding: "14px 16px",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    background: "var(--color-card)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardInfo: { display: "flex", flexDirection: "column" as const, gap: "2px" },
  cardTitle: {
    fontSize: "14px",
    fontWeight: "500",
    color: "var(--color-foreground)",
  },
  cardMeta: { fontSize: "12px", color: "var(--color-muted-foreground)" },
  badge: {
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "9999px",
    background: "var(--color-secondary)",
    color: "var(--color-secondary-foreground)",
    fontWeight: "500",
  },
  grid: { display: "flex", flexDirection: "column" as const, gap: "8px" },
};

export default function DashboardPage() {
  const { navigate } = useRouter();
  let issueNumber = "";
  let submitting = false;

  const agentsQuery = query(() => sdk.dashboard.listAgents());

  const workflowsQuery = query(() => sdk.workflows.list(), {
    refetchInterval: 5000,
  });

  const handleTrigger = async () => {
    if (!issueNumber || submitting) return;
    submitting = true;
    const data = await sdk.workflows.start({
      issueNumber: Number(issueNumber),
      repo: "vertz-dev/vertz",
    });
    submitting = false;
    issueNumber = "";
    workflowsQuery.refetch();
    navigate({ to: `/workflows/${data.id}` });
  };

  const agents = () => agentsQuery.data?.agents ?? [];
  const runs = () => workflowsQuery.data?.runs ?? [];

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.heading}>Dashboard</h1>
        <p style={s.subtitle}>Monitor workflows and trigger new runs</p>
      </div>

      <div style={s.statsRow}>
        <div style={s.statCard}>
          <div style={s.statValue}>{agents().length}</div>
          <div style={s.statLabel}>Agents</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{runs().length}</div>
          <div style={s.statLabel}>Workflows</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>
            {runs().filter((r) => r.status === "running").length}
          </div>
          <div style={s.statLabel}>Running</div>
        </div>
      </div>

      <div style={s.separator} />

      <div style={s.section}>
        <h2 style={s.sectionTitle}>Trigger Workflow</h2>
        <div style={s.triggerForm}>
          <div style={s.field}>
            <label style={s.label}>Issue Number</label>
            <input
              style={s.input}
              placeholder="e.g. 42"
              value={issueNumber}
              onInput={(e: Event) => {
                issueNumber = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <button style={s.btn} onClick={handleTrigger} disabled={submitting}>
            {submitting ? "Starting..." : "Start Workflow"}
          </button>
        </div>
      </div>

      <div style={s.separator} />

      <div style={s.section}>
        <h2 style={s.sectionTitle}>Active Workflows</h2>
        {workflowsQuery.loading && <span style={s.loading}>Refreshing...</span>}
        {workflowsQuery.error && (
          <div style={s.error}>Failed to load workflows</div>
        )}
        {runs().length === 0 && !workflowsQuery.loading && (
          <div style={s.empty}>No active workflows. Trigger one above.</div>
        )}
        {runs().length > 0 && (
          <div style={s.grid}>
            {runs().map((run) => (
              <div key={run.id} style={s.card}>
                <div style={s.cardInfo}>
                  <div style={s.cardTitle}>Issue #{run.issueNumber}</div>
                  <div style={s.cardMeta}>
                    {run.repo} &middot; Step: {run.currentStep}
                  </div>
                </div>
                <span style={s.badge}>{run.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
