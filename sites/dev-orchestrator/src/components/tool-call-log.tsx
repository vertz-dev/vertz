import { css } from '@vertz/ui';
import type { ToolCallLogProps } from './tool-call-log-utils';
import { formatToolDuration } from './tool-call-log-utils';

export type { ToolCallRecord, ToolCallLogProps } from './tool-call-log-utils';

const s = css({
  list: ['flex', 'flex-col', 'gap:1'],
  item: ['border:1', 'border:border', 'rounded:md', 'overflow:hidden'],
  header: [
    'flex',
    'items:center',
    'gap:2',
    'py:2',
    'px:3',
    'text:xs',
    'font:medium',
    'text:foreground',
    'bg:secondary',
    'cursor:pointer',
  ],
  duration: ['text:xs', 'text:muted-foreground', { '&': { 'margin-left': 'auto' } }],
  details: [
    'py:2',
    'px:3',
    'text:xs',
    'text:foreground',
    'border-t:1',
    'border:border',
    { '&': { 'font-family': 'monospace', 'white-space': 'pre-wrap', 'word-break': 'break-word', 'line-height': '1.4' } },
  ],
  label: ['text:muted-foreground', 'font:semibold', 'uppercase', { '&': { 'font-size': '10px', 'margin-bottom': '4px' } }],
  labelSpaced: [
    'text:muted-foreground',
    'font:semibold',
    'uppercase',
    { '&': { 'font-size': '10px', 'margin-bottom': '4px', 'margin-top': '8px' } },
  ],
  empty: ['text:sm', 'text:muted-foreground'],
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
