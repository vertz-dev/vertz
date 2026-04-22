import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: {
    maxWidth: '64rem',
    marginInline: 'auto',
    display: 'grid',
    gap: token.spacing[10],
  },
  heading: {
    fontSize: token.font.size['4xl'],
    marginBottom: token.spacing[3],
  },
  desc: {
    fontSize: token.font.size.lg,
    marginBottom: token.spacing[2],
    maxWidth: '40rem',
  },
  grid: {
    display: 'grid',
    gap: token.spacing[6],
    '@media (min-width: 768px)': { gridTemplateColumns: '1fr 1fr' },
  },
  card: {
    padding: token.spacing[6],
    borderWidth: '1px',
    '&': { borderRadius: '2px' },
  },
  cardLabel: {
    fontSize: token.font.size.sm,
    fontWeight: '600',
    marginBottom: token.spacing[3],
  },
  snippet: {
    fontSize: token.font.size.sm,
    overflowX: 'auto',
    whiteSpace: 'pre',
    margin: '0',
  },
});

interface ClientSnippet {
  label: string;
  command: string;
}

const clients: ClientSnippet[] = [
  {
    label: 'Claude Code',
    command: 'claude mcp add vertz-docs -- npx -y @vertz/docs-mcp',
  },
  {
    label: 'Cursor — settings.json',
    command:
      '{\n  "mcpServers": {\n    "vertz-docs": {\n      "command": "npx",\n      "args": ["-y", "@vertz/docs-mcp"]\n    }\n  }\n}',
  },
  {
    label: 'Windsurf — mcp_config.json',
    command:
      '{\n  "mcpServers": {\n    "vertz-docs": {\n      "command": "npx",\n      "args": ["-y", "@vertz/docs-mcp"]\n    }\n  }\n}',
  },
  {
    label: 'Zed — settings.json',
    command:
      '{\n  "context_servers": {\n    "vertz-docs": {\n      "command": {\n        "path": "npx",\n        "args": ["-y", "@vertz/docs-mcp"]\n      }\n    }\n  }\n}',
  },
];

export function UseInIde() {
  return (
    <section
      className={s.section}
      style={{
        background: '#0F0F0E',
        borderTop: '1px solid #2A2826',
        borderBottom: '1px solid #2A2826',
      }}
    >
      <div className={s.container}>
        <div>
          <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
            Use Vertz in your IDE.
          </h2>
          <p className={s.desc} style={{ color: '#9C9690' }}>
            One command and Claude, Cursor, Windsurf, or Zed has the full Vertz docs as a tool. No
            paste-into-prompt. No stale knowledge. Bypasses the model's training cutoff.
          </p>
        </div>
        <div className={s.grid}>
          {clients.map((client) => (
            <div
              key={client.label}
              className={s.card}
              style={{ background: '#1C1B1A', borderColor: '#2A2826' }}
            >
              <div className={s.cardLabel} style={{ color: '#E8E4DC' }}>
                {client.label}
              </div>
              <pre
                className={s.snippet}
                style={{
                  color: '#9C9690',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {client.command}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
