import type { ToolCallLogProps } from './tool-call-log-utils';
import { formatToolDuration } from './tool-call-log-utils';

export type { ToolCallRecord, ToolCallLogProps } from './tool-call-log-utils';

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  item: {
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500' as const,
    color: 'var(--color-foreground)',
    background: 'var(--color-secondary)',
  },
  duration: {
    fontSize: '11px',
    color: 'var(--color-muted-foreground)',
    marginLeft: 'auto',
  },
  details: {
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    lineHeight: '1.4',
    color: 'var(--color-foreground)',
    borderTop: '1px solid var(--color-border)',
  },
  label: {
    fontSize: '10px',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    color: 'var(--color-muted-foreground)',
    marginBottom: '4px',
  },
};

export default function ToolCallLog({ calls }: ToolCallLogProps) {
  if (calls.length === 0) {
    return <div style={{ fontSize: '13px', color: 'var(--color-muted-foreground)' }}>No tool calls</div>;
  }

  return (
    <div style={styles.list}>
      {calls.map((call, i) => (
        <details key={i} style={styles.item}>
          <summary style={styles.header}>
            <span>{call.name}</span>
            {call.duration !== undefined && (
              <span style={styles.duration}>{formatToolDuration(call.duration)}</span>
            )}
          </summary>
          <div style={styles.details}>
            <div style={styles.label}>Input</div>
            <div>{call.input}</div>
            {call.output && (
              <>
                <div style={{ ...styles.label, marginTop: '8px' }}>Output</div>
                <div>{call.output}</div>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
