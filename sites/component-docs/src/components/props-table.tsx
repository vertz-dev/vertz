import type { PropDefinition } from '../types';

interface PropsTableProps {
  props: PropDefinition[];
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: '600',
  color: 'var(--color-muted-foreground)',
  borderBottom: '1px solid var(--color-border)',
};

const tdStyle = {
  padding: '8px 16px',
  fontSize: '14px',
  color: 'var(--color-foreground)',
  borderBottom: '1px solid var(--color-border)',
};

const codeStyle = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '13px',
  backgroundColor: 'var(--color-muted)',
  padding: '2px 6px',
  borderRadius: '4px',
};

export function PropsTable({ props }: PropsTableProps) {
  if (props.length === 0) {
    return (
      <p style={{ fontSize: '14px', color: 'var(--color-muted-foreground)' }}>No props defined.</p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Default</th>
            <th style={thStyle}>Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr>
              <td style={tdStyle}>
                <code style={codeStyle}>{prop.name}</code>
              </td>
              <td style={tdStyle}>
                <code style={codeStyle}>{prop.type}</code>
              </td>
              <td style={tdStyle}>
                <code style={codeStyle}>{prop.default}</code>
              </td>
              <td style={tdStyle}>{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
