import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';

const styles = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '20px', maxWidth: '960px' },
  heading: { fontSize: '24px', fontWeight: '700', color: 'var(--color-foreground)', margin: '0' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '2px solid var(--color-border)',
    fontWeight: '600' as const,
    color: 'var(--color-muted-foreground)',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border)',
    color: 'var(--color-foreground)',
  },
  row: {
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  loading: { color: 'var(--color-muted-foreground)', fontSize: '13px' },
};

export default function DefinitionsListPage() {
  const { navigate } = useRouter();
  const defsQuery = query(() => sdk.definitions.list(), { key: 'definitions-list' });

  const definitions = () => defsQuery.data?.definitions ?? [];

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Workflow Definitions</h1>
      {defsQuery.loading && <div style={styles.loading}>Loading...</div>}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Steps</th>
            <th style={styles.th}>Agents</th>
          </tr>
        </thead>
        <tbody>
          {definitions().map((def) => {
            const agentNames = [...new Set(def.steps.filter((s) => s.agent).map((s) => s.agent))];
            return (
              <tr
                key={def.name}
                style={styles.row}
                onClick={() => navigate({ to: `/definitions/${def.name}` })}
              >
                <td style={styles.td}>{def.name}</td>
                <td style={styles.td}>{def.steps.length}</td>
                <td style={styles.td}>{agentNames.join(', ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
