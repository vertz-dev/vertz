import { css, token } from '@vertz/ui';
import type { PromptEditorProps } from './prompt-editor-utils';
import PromptInspector from './prompt-inspector';

const s = css({
  container: { display: 'flex', gap: token.spacing[4] },
  pane: { display: 'flex', flexDirection: 'column', gap: token.spacing[1], '&': { flex: '1' } },
  label: {
    fontWeight: token.font.weight.semibold,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    '&': { fontSize: '11px' },
  },
  textarea: {
    borderRadius: token.radius.md,
    backgroundColor: token.color.card,
    color: token.color.foreground,
    resize: 'vertical',
    '&': {
      fontFamily: 'monospace',
      fontSize: '12px',
      lineHeight: '1.6',
      padding: '12px 16px',
      border: '1px solid var(--color-border)',
      minHeight: '200px',
      maxHeight: '400px',
    },
  },
});

export default function PromptEditor({ value, onChange }: PromptEditorProps) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onChange(target.value), 300);
  };

  return (
    <div className={s.container}>
      <div className={s.pane}>
        <span className={s.label}>Edit</span>
        <textarea className={s.textarea} value={value} onInput={handleInput} />
      </div>
      <div className={s.pane}>
        <span className={s.label}>Preview</span>
        <PromptInspector value={value} />
      </div>
    </div>
  );
}
