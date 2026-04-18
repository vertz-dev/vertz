import { css, token } from '@vertz/ui';
import { parsePromptSegments } from './prompt-editor-utils';
import type { PromptInspectorProps } from './prompt-editor-utils';

const s = css({
  container: {
    borderRadius: token.radius.md,
    backgroundColor: token.color.secondary,
    color: token.color.foreground,
    overflow: 'auto',
    '&': {
      fontSize: '12px',
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      padding: '12px 16px',
      maxHeight: '400px',
      lineHeight: '1.6',
    },
  },
  variable: {
    fontWeight: token.font.weight.semibold,
    '&': {
      background: 'hsl(217, 91%, 60%, 0.15)',
      color: 'hsl(217, 91%, 60%)',
      padding: '1px 4px',
      borderRadius: '3px',
    },
  },
});

export default function PromptInspector({ value }: PromptInspectorProps) {
  const segments = parsePromptSegments(value);

  return (
    <div className={s.container}>
      {segments.map((seg, i) =>
        seg.type === 'variable' ? (
          <span key={i} className={s.variable}>{`{{${seg.value}}}`}</span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </div>
  );
}
