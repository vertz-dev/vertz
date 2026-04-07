import type { PromptEditorProps } from './prompt-editor-utils';
import PromptInspector from './prompt-inspector';

const styles = {
  container: {
    display: 'flex',
    gap: '16px',
  },
  pane: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    color: 'var(--color-muted-foreground)',
  },
  textarea: {
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    padding: '12px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'var(--color-card)',
    color: 'var(--color-foreground)',
    resize: 'vertical' as const,
    minHeight: '200px',
    maxHeight: '400px',
  },
};

export default function PromptEditor({ value, onChange }: PromptEditorProps) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onChange(target.value), 300);
  };

  return (
    <div style={styles.container}>
      <div style={styles.pane}>
        <span style={styles.label}>Edit</span>
        <textarea
          style={styles.textarea}
          value={value}
          onInput={handleInput}
        />
      </div>
      <div style={styles.pane}>
        <span style={styles.label}>Preview</span>
        <PromptInspector value={value} />
      </div>
    </div>
  );
}
