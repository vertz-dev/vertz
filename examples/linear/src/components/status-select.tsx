import { css } from '@vertz/ui';
import { STATUSES } from '../lib/issue-config';
import type { IssueStatus } from '../lib/types';

const styles = css({
  container: ['flex', 'flex-col', 'gap:1'],
  label: ['text:xs', 'font:medium', 'text:muted-foreground'],
  select: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:1.5',
    'text:sm',
    'text:foreground',
    'cursor:pointer',
  ],
});

interface StatusSelectProps {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
}

export function StatusSelect({ value, onChange }: StatusSelectProps) {
  return (
    <div class={styles.container}>
      <label class={styles.label} htmlFor="issue-status-select">
        Status
      </label>
      <select
        class={styles.select}
        id="issue-status-select"
        value={value}
        onChange={(e: Event) => {
          onChange((e.target as HTMLSelectElement).value as IssueStatus);
        }}
      >
        {STATUSES.map((opt) => (
          <option value={opt.value} key={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
