import { parsePromptSegments } from './prompt-editor-utils';
import type { PromptInspectorProps } from './prompt-editor-utils';

const styles = {
  container: {
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    padding: '12px 16px',
    background: 'var(--color-secondary)',
    borderRadius: '6px',
    maxHeight: '400px',
    overflow: 'auto',
    color: 'var(--color-foreground)',
    lineHeight: '1.6',
  },
  variable: {
    background: 'hsl(217, 91%, 60%, 0.15)',
    color: 'hsl(217, 91%, 60%)',
    padding: '1px 4px',
    borderRadius: '3px',
    fontWeight: '600' as const,
  },
};

export default function PromptInspector({ value }: PromptInspectorProps) {
  const segments = parsePromptSegments(value);

  return (
    <div style={styles.container}>
      {segments.map((seg, i) =>
        seg.type === 'variable'
          ? <span key={i} style={styles.variable}>{`{{${seg.value}}}`}</span>
          : <span key={i}>{seg.value}</span>,
      )}
    </div>
  );
}
