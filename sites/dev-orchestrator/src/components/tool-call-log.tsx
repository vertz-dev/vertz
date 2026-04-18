import { css, token } from '@vertz/ui';
import type { ToolCallLogProps } from './tool-call-log-utils';
import { formatToolDuration } from './tool-call-log-utils';

export type { ToolCallRecord, ToolCallLogProps } from './tool-call-log-utils';

const s = css({
  list: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  item: {
    borderWidth: '1px',
    borderColor: token.color.border,
    borderRadius: token.radius.md,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingBlock: token.spacing[2],
    paddingInline: token.spacing[3],
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    cursor: 'pointer',
  },
  duration: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    '&': { marginLeft: 'auto' },
  },
  details: {
    paddingBlock: token.spacing[2],
    paddingInline: token.spacing[3],
    fontSize: token.font.size.xs,
    color: token.color.foreground,
    borderTopWidth: '1px',
    borderColor: token.color.border,
    '&': {
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      lineHeight: '1.4',
    },
  },
  label: {
    color: token.color['muted-foreground'],
    fontWeight: token.font.weight.semibold,
    textTransform: 'uppercase',
    '&': { fontSize: '10px', marginBottom: '4px' },
  },
  labelSpaced: {
    color: token.color['muted-foreground'],
    fontWeight: token.font.weight.semibold,
    textTransform: 'uppercase',
    '&': { fontSize: '10px', marginBottom: '4px', marginTop: '8px' },
  },
  empty: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
});

export default function ToolCallLog({ calls }: ToolCallLogProps) {
  if (calls.length === 0) {
    return <div className={s.empty}>No tool calls</div>;
  }

  return (
    <div className={s.list}>
      {calls.map((call, i) => (
        <details key={i} className={s.item}>
          <summary className={s.header}>
            <span>{call.name}</span>
            {call.duration !== undefined && (
              <span className={s.duration}>{formatToolDuration(call.duration)}</span>
            )}
          </summary>
          <div className={s.details}>
            <div className={s.label}>Input</div>
            <div>{call.input}</div>
            {call.output && (
              <>
                <div className={s.labelSpaced}>Output</div>
                <div>{call.output}</div>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
