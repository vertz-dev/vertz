import { css, token } from '@vertz/ui';
import { query } from '@vertz/ui/query';
import { useRouter } from '@vertz/ui/router';
import { sdk } from '../lib/sdk';

const s = css({
  page: ['flex', 'flex-col', { '&': { gap: '20px', 'max-width': '960px' } }],
  heading: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    margin: token.spacing[0],
  },
  table: ['w:full', 'text:sm', { '&': { 'border-collapse': 'collapse' } }],
  th: [
    'text:left',
    'text:xs',
    'font:semibold',
    'text:muted-foreground',
    'uppercase',
    'border-b:2',
    'border:border',
    { '&': { padding: '8px 12px' } },
  ],
  td: ['text:foreground', 'border-b:1', 'border:border', { '&': { padding: '10px 12px' } }],
  row: { cursor: 'pointer', transition: 'background 0.1s' },
  loading: { color: token.color['muted-foreground'], fontSize: token.font.size.sm },
});

export default function DefinitionsListPage() {
  const { navigate } = useRouter();
  const defsQuery = query(() => sdk.definitions.list(), { key: 'definitions-list' });

  const definitions = () => defsQuery.data?.definitions ?? [];

  return (
    <div className={s.page}>
      <h1 className={s.heading}>Workflow Definitions</h1>
      {defsQuery.loading && <div className={s.loading}>Loading...</div>}
      {defsQuery.error && <div className={s.loading}>Failed to load definitions.</div>}
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>Name</th>
            <th className={s.th}>Steps</th>
            <th className={s.th}>Agents</th>
          </tr>
        </thead>
        <tbody>
          {definitions().map((def) => {
            const agentNames = [...new Set(def.steps.filter((s) => s.agent).map((s) => s.agent))];
            return (
              <tr
                key={def.name}
                className={s.row}
                onClick={() => navigate({ to: `/definitions/${def.name}` })}
              >
                <td className={s.td}>{def.name}</td>
                <td className={s.td}>{def.steps.length}</td>
                <td className={s.td}>{agentNames.join(', ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
