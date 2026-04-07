import { css } from '@vertz/ui';
import { parsePromptSegments } from './prompt-editor-utils';
import type { PromptInspectorProps } from './prompt-editor-utils';

const s = css({
  container: [
    'rounded:md',
    'bg:secondary',
    'text:foreground',
    'overflow:auto',
    { '&': { 'font-size': '12px', 'font-family': 'monospace', 'white-space': 'pre-wrap', 'word-break': 'break-word', padding: '12px 16px', 'max-height': '400px', 'line-height': '1.6' } },
  ],
  variable: [
    'font:semibold',
    { '&': { background: 'hsl(217, 91%, 60%, 0.15)', color: 'hsl(217, 91%, 60%)', padding: '1px 4px', 'border-radius': '3px' } },
  ],
});

export default function PromptInspector({ value }: PromptInspectorProps) {
  const segments = parsePromptSegments(value);

  return (
    <div className={s.container}>
      {segments.map((seg, i) =>
        seg.type === 'variable'
          ? <span key={i} className={s.variable}>{`{{${seg.value}}}`}</span>
          : <span key={i}>{seg.value}</span>,
      )}
    </div>
  );
}
