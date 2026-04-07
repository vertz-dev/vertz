import { css } from '@vertz/ui';
import type { PromptEditorProps } from './prompt-editor-utils';
import PromptInspector from './prompt-inspector';

const s = css({
  container: [
    'flex',
    'gap:4',
  ],
  pane: [
    'flex',
    'flex-col',
    'gap:1',
    { '&': { flex: '1' } },
  ],
  label: [
    'font:semibold',
    'text:muted-foreground',
    'uppercase',
    { '&': { 'font-size': '11px' } },
  ],
  textarea: [
    'rounded:md',
    'bg:card',
    'text:foreground',
    'resize:vertical',
    { '&': { 'font-family': 'monospace', 'font-size': '12px', 'line-height': '1.6', padding: '12px 16px', border: '1px solid var(--color-border)', 'min-height': '200px', 'max-height': '400px' } },
  ],
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
        <textarea
          className={s.textarea}
          value={value}
          onInput={handleInput}
        />
      </div>
      <div className={s.pane}>
        <span className={s.label}>Preview</span>
        <PromptInspector value={value} />
      </div>
    </div>
  );
}
